import * as THREE from 'three';
import { COMMON_GLSL } from './shaderLib.js';
import { gis } from './glyphs.js';
import { DRAGON_PRINT_GLSL, DP_CELL, dragonPrintUniforms, dragonLook } from './dragonPrint.js';
import { DRAGON_PRINT_FX_GLSL, DP_FX_U } from './dragonPrintFx.js';

// THE FALLEN LEAF IN THE DRAGON PRINT (switch `leafLook`; the owner, 2026-11-25: "in the dragon level i
// don't want the leaves on the ground to actually look like normal letters (C, S) as they dont look like
// leaves"). What the litter (world/life/litter.js) lays on the ground is drawn one of these ways:
//
//   '0'  the letters as they ship (c e ( ) s ..., the litter's own glyph pool); the default under ?dragon=0
//   'a'  THE LENS (the author's pick): a lying leaf is ONE glyph lying flat on the ground along it: the
//        world atlas's slashed zero, its height laid along the leaf, so its oval reads as the blade and its
//        slash as the midrib; the blade between the strokes filled with its dark face, a short stroke for
//        its stem. Lit per pixel as the dragon ground is (the moon, its shadow map, the cloud and contact
//        upgrades, the point lights): one end catches the moon (it curls), the other falls dark; dark in a
//        shadow, warm by the fire. Blended over the floor (a fading leaf fades).
//   'b'  THE CELLS: a lying leaf is a few of the ground's OWN cells (the dragon print's world-anchored
//        lattice, render/dragonPrint.js) printed in the leaf's warm colour: a short line of cells along the
//        leaf (its blade, in round digits picked by its light, lighter at its ends), a stroke cell for its
//        stem (- / | \ by its way on the screen). Lit as 'a'. A fading leaf loses its cells one by one.
//   'c'  TINY HOUSE LETTERS: a lying leaf is a little sketch in the living world's letters (LetterBatch,
//        the wyrm's 5 x 8 px pixel font, upright): a tiny oval and a stroke for its stem (world/life/litter.js)
//   A scorch chars a lying leaf in a and b (ash letters, embers glowing in it as in the ground).
//
// HOW a AND b DRAW (LeafPrint, `mode` 1 the lens, 0 the cells): one instanced draw, a small flat quad per
// lying leaf a little over the floor (LITTER.print.y: above the slabs' tops, so a leaf on a flagstone shows
// too, not only on the ground). Each fragment finds the ground point behind it (the camera's ray met with
// y = 0: for b the ground's own cell, exactly the one the ground prints there), and draws the leaf's shape
// there or is discarded. Drawn after the opaque world (the transparent queue), no depth write, depth-tested:
// what stands in front hides it. The cells replace the ground's (no blending); the lens is blended over it.
// The scene's alpha (its ASCII flag) is never changed: the cells write 0 (a plain surface, as the ground),
// the lens keeps what is there.
//
//   const p = new LeafPrint(U, max, PRINT, cot, mode)   (PRINT = LITTER.print, its glyph sets and numbers)
//   each frame: p.begin(); p.put(x, z, ang, len, shape, fade, seed, r, g, b, curl, glow, wide); p.end()
//   p.mesh                                              (add it to the world scene)
//
// The shapes (`shape`): 0 a leaf (blade + stem), 1 a slip of paper (a pale bar of '='), 2 a grain (one
// round glyph, one cell in b), 3 a seed or a straw (strokes along it).

export const LEAF_LOOKS = Object.freeze(['0', 'a', 'b', 'c']);
export const LEAF_SHAPES = Object.freeze({ leaf: 0, slip: 1, grit: 2, seed: 3 });

/** The fallen leaves' look now: '0' | 'a' | 'b' | 'c' ('a' by default, '0' under ?dragon=0). */
export function leafLook() {
  const v = dragonLook('leafLook');
  return LEAF_LOOKS.includes(v) ? v : '0';
}

const pick = (name, arr) => /* glsl */ `float ${name}(int i) { float r = ${arr}[0]; for (int k = 0; k < ${arr}_N; k++) if (k == i) r = ${arr}[k]; return r; }`;

export class LeafPrint {
  /**
   * @param U    the game's shared uniforms (game.U)
   * @param max  most leaves printed at once
   * @param P    LITTER.print: { y, ramp, grit, slip, strokes, ash, stem, char }
   * @param cot  cot of the game camera's pitch (where the quad over a leaf is put)
   * @param mode 0 the cells (look a's print in the lattice), 1 the lens (one glyph lying flat: look c)
   */
  constructor(U, max, P, cot = 0.625, mode = 0) {
    this.max = max;
    this.n = 0;
    this.mode = mode;
    const base = new THREE.PlaneGeometry(2, 2);
    base.rotateX(-Math.PI / 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    const attr = () => new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iA = attr();
    this.iB = attr();
    this.iC = attr();
    this.iD = attr();
    geo.setAttribute('iA', this.iA);
    geo.setAttribute('iB', this.iB);
    geo.setAttribute('iC', this.iC);
    geo.setAttribute('iD', this.iD);
    geo.instanceCount = 0;
    this.geometry = geo;
    const ramp = gis(P.ramp), grit = gis(P.grit), ash = gis(P.ash);
    this.uniforms = {
      uTime: U.uTime, uMoonDir: U.uMoonDir, uMoonColor: U.uMoonColor, uAmbient: U.uAmbient,
      uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uFocus: U.uFocus,
      uCamPos: U.uCamPos, uPLPos: U.uPLPos, uPLCol: U.uPLCol, uPLRad: U.uPLRad,
      uShadowMap: U.uShadowMap, uShadowMatrix: U.uShadowMatrix, uShadowTexel: U.uShadowTexel,
      uGlyphAtlas: U.uGlyphAtlas, uScorch: U.uScorch, uScorchBounds: U.uScorchBounds,
      ...dragonPrintUniforms(),
      ...DP_FX_U,
      uLfRamp: { value: ramp },
      uLfGrit: { value: grit },
      uLfAsh: { value: ash },
      uLfStroke: { value: gis(P.strokes) },
      uLfSlip: { value: gis(P.slip)[0] },
      // the quad's height over the floor (m), cot(pitch); the stem's length (cells), its light, the char's colour
      uLfK: { value: new THREE.Vector4(P.y, cot, P.stem, P.stemLight) },
      uLfChar: { value: new THREE.Vector3(...P.char) },
      // the body's gain, the tone's lift (a leaf lies a little proud of the ground: it catches more), the
      // blade's taper (its ends print a lighter digit than its middle: a lens), 0
      uLfGain: { value: mode === 1 ? new THREE.Vector4(P.lensGain ?? 1, P.lensLift ?? 0, 0, 0) : new THREE.Vector4(P.gain ?? 1, P.lift ?? 0, P.taper ?? 0, 0) },
      // the lens (mode 1): its glyph's cell width (m), the share of its cell its ink spans along it, the
      // stem's length (m), a grain's cell (m); its glyphs: the blade, the stem / a straw, a grain; the body's
      // fill (its share of the ink's light, its opacity), the blade's half-width (m), 0
      uLfLens: { value: new THREE.Vector4(P.lensW ?? 0.26, P.lensInk ?? 0.7, P.lensStem ?? 0.12, P.lensGrit ?? 0.2) },
      uLfLensG: { value: new THREE.Vector3(gis(P.lens ?? '0')[0], gis(P.stemGlyph ?? '-')[0], gis('o')[0]) },
      uLfFill: { value: new THREE.Vector4(P.fill ?? 0.35, P.fillA ?? 1, P.lensHalf ?? 0.06, 0) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      defines: { LF_RAMP_N: ramp.length, LF_GRIT_N: grit.length, LF_MODE: mode },
      vertexShader: /* glsl */ `
        attribute vec4 iA; // x, z (the leaf's footprint), its axis (rad, atan2(dz, dx)), its half-length (m)
        attribute vec4 iB; // the blade's extra half-width (cells), shape, fade 0..1, seed 0..1
        attribute vec4 iC; // body colour (rgb), curl
        attribute vec4 iD; // glow, 0, 0, 0
        uniform vec4 uLfK;
        varying vec3 vW;
        varying vec4 vA;
        varying vec4 vB;
        varying vec4 vC;
        varying vec4 vD;
        void main() {
          // a box round the leaf's cells, raised to uLfK.x and pushed north by what the raise costs on screen
          float R = iA.w + 0.42;
          vec3 wp = vec3(iA.x + position.x * R, uLfK.x, iA.y + uLfK.x * uLfK.y + position.z * R);
          vW = wp;
          vA = iA;
          vB = iB;
          vC = iC;
          vD = iD;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON_GLSL}
        ${DRAGON_PRINT_GLSL}
        // (a flat relief: the upgrades' functions this print calls do not read it)
        float leafRelief(vec2 p, float d) { return 0.0; }
        #define DP_RELIEF leafRelief
        ${DRAGON_PRINT_FX_GLSL}
        #define uLfRamp_N LF_RAMP_N
        #define uLfGrit_N LF_GRIT_N
        #define uLfAsh_N 5
        #define uLfStroke_N 4
        uniform float uLfRamp[LF_RAMP_N];
        uniform float uLfGrit[LF_GRIT_N];
        uniform float uLfAsh[5];
        uniform float uLfStroke[4];
        uniform float uLfSlip;
        uniform vec4 uLfK;
        uniform vec3 uLfChar;
        uniform vec4 uLfGain;
        uniform vec4 uLfLens;
        uniform vec3 uLfLensG;
        uniform vec4 uLfFill;
        varying vec3 vW;
        varying vec4 vA;
        varying vec4 vB;
        varying vec4 vC;
        varying vec4 vD;
        ${pick('lfRamp', 'uLfRamp')}
        ${pick('lfGrit', 'uLfGrit')}
        ${pick('lfAsh', 'uLfAsh')}
        ${pick('lfStroke', 'uLfStroke')}
        // the stroke for a way on the screen (cell units, x right, y up): dash, slash, bar, backslash
        // (a backslash ending a GLSL comment would swallow the next line)
        float strokeFor(vec2 a) {
          float k = mod(floor(mod(atan(a.y, a.x), 3.14159265) / 0.7853982 + 0.5), 4.0);
          return lfStroke(int(k));
        }
        void main() {
          // the ground point behind this pixel (the ray from the eye met with y = 0): the ground's own cell
          vec3 ray = vW - cameraPosition;
          vec2 gp = (cameraPosition + ray * (cameraPosition.y / max(cameraPosition.y - vW.y, 1e-3))).xz;
#if LF_MODE == 1
          // ---- THE LENS: the leaf as ONE glyph lying flat on the ground (the blade glyph's height along the
          // leaf, so it reads as a lens with a midrib), its body filled dark, lit per pixel as the ground is
          vec2 dw = gp - vA.xy;
          vec2 axw2 = vec2(cos(vA.z), sin(vA.z));
          float al = dot(dw, axw2), ac = dot(dw, vec2(-axw2.y, axw2.x));
          int shape = int(vB.y + 0.5);
          float len = max(vA.w, 0.04);
          float W = uLfLens.x;
          float m = 0.0, fill = 0.0, idx = uLfLensG.x;
          vec2 uv;
          if (shape == 2) {
            uv = vec2(dw.x, -dw.y) / uLfLens.w + 0.5;
            idx = uLfLensG.z;
          } else if (shape == 0) {
            uv = vec2(ac / W + 0.5, al / (2.0 * len / uLfLens.y) + 0.5);
            float bw = uLfFill.z;
            float e = (ac * ac) / (bw * bw) + (al * al) / (len * len);
            fill = (1.0 - smoothstep(0.7, 1.0, e)) * uLfFill.y;
          } else {
            uv = vec2(al / (2.0 * len / 0.8) + 0.5, ac / W + 0.5);
            idx = shape == 1 ? uLfSlip : uLfLensG.y;
          }
          if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) m = glyphGrad(idx, uv, dFdx(uv), dFdy(uv));
          bool stem = false;
          if (shape == 0) {
            // the stem: a short stroke along it past the blade's base
            float sl = uLfLens.z;
            vec2 us = vec2((al + len + sl * 0.3) / sl + 0.5, ac / (W * 0.8) + 0.5);
            if (us.x > 0.0 && us.y > 0.0 && us.x < 1.0 && us.y < 1.0) {
              float ms = glyphGrad(uLfLensG.y, us, dFdx(us), dFdy(us));
              if (ms > m) { m = ms * uLfK.w; stem = true; }
            }
          }
          float a = max(m, fill) * vB.z;
          if (a < 0.02) discard;
          float s = clamp(al / len, -1.0, 1.0);
          vec3 axw = vec3(axw2.x, 0.0, axw2.y);
          float h = vB.w;
          vec3 N = normalize(vec3(0.0, 1.0, 0.0) - axw * s * vC.w);
          vec3 cw = vec3(gp.x, 0.0, gp.y);
          vec2 sc = scorchAt(gp);
          float burn = sc.x, heat = sc.y;
          float shc = shadowAt(cw + vec3(0.0, 0.06, 0.0)) * dpCloud(gp);
          float lam = max(dot(N, uMoonDir), 0.0);
          vec3 PL = pointLights(cw + vec3(0.0, 0.08, 0.0), N, 0.0);
          float t = smoothstep(uMoonDir.y - 0.3, uMoonDir.y + 0.25, lam) * shc;
          t = clamp(t * 0.85 + luma(PL) * 2.0 + uLfGain.y * shc, 0.0, 1.0);
          t *= 1.0 - dpContact(gp);
          vec3 body = vC.rgb * uLfGain.x;
          body = mix(body, uLfChar, clamp(burn * 1.6, 0.0, 1.0));
          vec3 L = ambientAt(vec3(0.0, 1.0, 0.0)) + uMoonColor * uMoonDir.y * shc * 0.85 + pointLights(cw + vec3(0.0, 0.05, 0.0), vec3(0.0, 1.0, 0.0), 0.0);
          // the ink (the glyph's strokes: its outline and midrib) lit; the body between them its dark face
          vec3 inkC = body * (0.2 + 1.5 * t) * L * 1.15 + body * vD.x;
          vec3 fillC = body * (0.08 + 1.5 * t * uLfFill.x) * L * 1.15 + body * vD.x * 0.5;
          vec3 col = mix(fillC, inkC, clamp(m / max(max(m, fill), 1e-3), 0.0, 1.0));
          float flick = 0.65 + 0.35 * sin(uTime * 9.0 + h * 40.0);
          col += vec3(1.0, 0.28, 0.04) * heat * heat * (0.18 + 1.6 * m) * flick;
          col = applyFog(col, cw);
          gl_FragColor = vec4(col, a);
#else
          vec2 size = vec2(${DP_CELL[0]}, ${DP_CELL[1]});
          vec2 f, g;
          vec2 cell = dpLattice(gp, size, f, g);
          float h = hash12(cell);
          vec2 cxz = dpCellCenter(cell, size);
          // the leaf in cell units (x right, y up the screen = -z)
          vec2 d = (cxz - vA.xy) / size * vec2(1.0, -1.0);
          vec2 ax = vec2(cos(vA.z), -sin(vA.z)) / size;
          float Lc = length(ax) * vA.w;
          ax = normalize(ax);
          float al = dot(d, ax), ac = dot(d, vec2(-ax.y, ax.x));
          int shape = int(vB.y + 0.5);
          // the cells the midrib passes through (one a row or a column), the blade a little wider in its middle
          float thin = 0.5 * max(abs(ax.x), abs(ax.y));
          float s = al / max(Lc, 0.5);
          bool stem = false;
          if (shape == 2) {
            if (abs(d.x) > 0.5 || abs(d.y) > 0.5) discard;
          } else {
            if (abs(ac) > thin + vB.x * max(0.0, 1.0 - s * s)) discard;
            if (al > Lc) discard;
            if (al < -Lc) {
              if (shape != 0 || al < -Lc - uLfK.z) discard;
              stem = true;
            }
          }
          // a fading leaf loses its cells one by one
          if (hash12(cell + vB.w * 17.0) > vB.z) discard;
          // the leaf's face: it curls (its ends turn up), so one end faces the moon, the other falls dark
          vec3 axw = vec3(cos(vA.z), 0.0, sin(vA.z));
          vec3 N = normalize(vec3(0.0, 1.0, 0.0) - axw * clamp(s, -1.0, 1.0) * vC.w + vec3(hash12(cell + 2.3) - 0.5, 0.0, hash12(cell + 4.1) - 0.5) * 0.35);
          vec3 cw = vec3(cxz.x, 0.0, cxz.y);
          vec2 sc = scorchAt(cxz);
          float burn = sc.x, heat = sc.y;
          // lit as the ground is (world/ground.js look b): the moon (its shadow, the drifting cloud), the lights
          float shc = shadowAt(cw + vec3(0.0, 0.06, 0.0)) * dpCloud(cxz);
          float lam = max(dot(N, uMoonDir), 0.0);
          vec3 PL = pointLights(cw + vec3(0.0, 0.08, 0.0), N, 0.0);
          float t = smoothstep(uMoonDir.y - 0.3, uMoonDir.y + 0.25, lam) * shc;
          t = clamp(t * 0.85 + luma(PL) * 2.0 + uLfGain.y * shc, 0.0, 1.0);
          t *= 1.0 - dpContact(cxz);
          float idx;
          vec3 body = vC.rgb * uLfGain.x;
          if (stem) {
            idx = strokeFor(ax);
            body *= uLfK.w;
          } else if (shape == 1) {
            idx = uLfSlip;
          } else if (shape == 3) {
            idx = strokeFor(ax);
          } else if (shape == 2) {
            idx = lfGrit(int(clamp(t * float(LF_GRIT_N) + (h - 0.5) * 0.8, 0.0, float(LF_GRIT_N) - 0.01)));
          } else {
            // (tapered: the ends a few digits lighter than the middle, so the blade reads as a lens)
            float tt = t - uLfGain.z * clamp(s * s, 0.0, 1.0);
            idx = lfRamp(int(clamp(tt * float(LF_RAMP_N) + (h - 0.5) * 1.2, 0.0, float(LF_RAMP_N) - 0.01)));
          }
          // a scorch chars it (ash letters where it burnt)
          body = mix(body, uLfChar, clamp(burn * 1.6, 0.0, 1.0));
          if (burn > 0.35) idx = lfAsh(int(fract(h * 7.1) * 5.0));
          body *= mix(0.55, 1.0, vB.z);
          float m = glyphGrad(idx, f, dFdx(g), dFdy(g));
          vec3 L = ambientAt(vec3(0.0, 1.0, 0.0)) + uMoonColor * uMoonDir.y * shc * 0.85 + pointLights(cw + vec3(0.0, 0.05, 0.0), vec3(0.0, 1.0, 0.0), 0.0);
          vec3 col = vec3(0.008, 0.01, 0.01) * L + body * (0.2 + 1.5 * t) * L * m * 1.15 + body * vD.x * m;
          // embers glowing in the ash (as the ground's)
          float flick = 0.65 + 0.35 * sin(uTime * 9.0 + h * 40.0);
          col += vec3(1.0, 0.28, 0.04) * heat * heat * (0.18 + 1.6 * m) * flick;
          col = applyFog(col, cw);
          gl_FragColor = vec4(col, 0.0);
#endif
        }
      `,
      transparent: true,
      // (the cells replace the ground's; the lens is blended over it, the scene's alpha (its ASCII flag) kept)
      blending: mode === 1 ? THREE.CustomBlending : THREE.NoBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'leafPrint';
    this.mesh.visible = false;
    /** drawn at all (the litter's setVisible); the mesh is shown only while it has a leaf to draw */
    this.shown = true;
  }

  /** The world hidden or shown (the Lab): nothing drawn while hidden. */
  setShown(on) {
    this.shown = !!on;
    this.mesh.visible = this.shown && this.n > 0;
  }

  begin() {
    this.n = 0;
  }

  /** One leaf: footprint (x, z), axis (rad), half-length (m), shape, fade 0..1, seed 0..1, colour, curl, glow,
   *  the blade's extra half-width (cells). */
  put(x, z, ang, len, shape, fade, seed, r, g, b, curl = 0.5, glow = 0, wide = 0) {
    const n = this.n;
    if (n >= this.max || !(fade > 0.01) || !(x === x && z === z && ang === ang && len === len)) return;
    const A = this.iA.array, B = this.iB.array, C = this.iC.array, D = this.iD.array, k = n * 4;
    A[k] = x; A[k + 1] = z; A[k + 2] = ang; A[k + 3] = len;
    B[k] = wide; B[k + 1] = shape; B[k + 2] = fade; B[k + 3] = seed;
    C[k] = r; C[k + 1] = g; C[k + 2] = b; C[k + 3] = curl;
    D[k] = glow; D[k + 1] = 0; D[k + 2] = 0; D[k + 3] = 0;
    this.n = n + 1;
  }

  end() {
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.shown && this.n > 0;
    if (this.n > 0) this.iA.needsUpdate = this.iB.needsUpdate = this.iC.needsUpdate = this.iD.needsUpdate = true;
  }

  /** Nothing printed (the piece off, the look changed). */
  empty() {
    this.n = 0;
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
