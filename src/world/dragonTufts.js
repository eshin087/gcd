import * as THREE from 'three';
import { COMMON_GLSL, TRAIL_N, TRAIL_CH } from '../render/shaderLib.js';
import { DRAGON_PRINT_GLSL, dragonPrintUniforms } from '../render/dragonPrint.js';
import { DRAGON_PRINT_FX_GLSL, DP_FX_U } from '../render/dragonPrintFx.js';
import { gis } from '../render/glyphs.js';
import { TRAIL_BEND_GLSL } from './grassTrail.js';
import { DG, dgTuftGlsl, dgGrassOpt, dgCutOpt } from './dragonGrass.js';
import { GRASS } from './grassTuning.js';

// THE TUFTS STANDING (dgGrass a3d3, the most 3D step of the printed tufts; world/dragonGrass.js). The very
// tufts the ground prints (dgTuftN: the same cells, heights and fans) stand up as billboards on the print's
// lattice: one quad a tuft, three cells wide and as many rows tall as the tuft, printing its digits and its
// '\ | /' tips in the print's cells (the wyrm's 5 x 8 px at 720p), lit as the print is (the moon on their
// lean, their shadow at each digit's height, the fire's light). So a tuft in front of the hero hides his
// feet, the wake bends it for real (the blades' own trailBend: it leans along his way, lies down, rises), and
// one in front of another hides it; the ground keeps the soil, the tufts' short shadows, the stubble and the
// laid grass under them.
//
// No CPU work a frame and no per-tuft data: the instances are a window of the print's cells round the
// camera's focus (uFocus), each instance's cell worked out in its vertex shader; a cell with no tuft (or a
// tuft cut, burnt, torn out) draws nothing. Built by world/mowFx.js (drawn as a child of the cut tops'
// batch, so it is in the scene with it).

const W = 300; // cells across the window (~40 m at the print's 0.135 m)
const H = 136; // rows (~34 m)

export class DragonTufts {
  constructor(game, opt = dgGrassOpt(), cut = dgCutOpt()) {
    const U = game.U;
    // the meadow's density lives on the ground's material (ground.js setMeadow): read the same uniforms
    const gu = game.world?.ground?.material?.uniforms ?? {};
    const S = DG.step[opt] ?? DG.step.a3d3;
    const T = DG.tuft;
    const cell = DG.cut.cell;
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.instanceCount = W * H;
    const tips = gis('\\|/').map((v) => v.toFixed(1)).join(', ');
    const laid = gis('=~').map((v) => v.toFixed(1)).join(', ');
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.uTime, uMoonDir: U.uMoonDir, uMoonColor: U.uMoonColor, uAmbient: U.uAmbient,
        uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uFocus: U.uFocus,
        uCamPos: U.uCamPos, uPLPos: U.uPLPos, uPLCol: U.uPLCol, uPLRad: U.uPLRad,
        uShadowMap: U.uShadowMap, uShadowMatrix: U.uShadowMatrix, uShadowTexel: U.uShadowTexel,
        uGlyphAtlas: U.uGlyphAtlas, uScorch: U.uScorch, uScorchBounds: U.uScorchBounds,
        uCamRight: U.uCamRight, uBladeUp: U.uBladeUp,
        uMeadow: gu.uMeadow ?? { value: null },
        uMeadowExt: gu.uMeadowExt ?? { value: 150 },
        uMeadowOn: gu.uMeadowOn ?? { value: 0 },
        uDry: gu.uDry ?? { value: 0 },
        uTrail: U.uTrail ?? { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector4()) },
        uTrailBox: U.uTrailBox ?? { value: Array.from({ length: TRAIL_CH }, () => new THREE.Vector4()) },
        uBend: U.uBend ?? { value: new THREE.Vector4(0, 0, 0, 0) },
        uBendT: U.uBendT ?? { value: new THREE.Vector4(0, 1, 0, 0) },
        uBendS: U.uBendS ?? { value: new THREE.Vector4(0, 0, 0, 0) },
        uBendE: U.uBendE ?? { value: new THREE.Vector4(0, 1, 0, 0) },
        ...dragonPrintUniforms(),
        // (the print's upgrades: cloud and contact shadows; the cut's map rides in the same object)
        ...DP_FX_U,
      },
      vertexShader: /* glsl */ `
        ${COMMON_GLSL}
        ${DRAGON_PRINT_GLSL}
        uniform vec3 uCamRight;
        uniform vec3 uBladeUp;
        uniform sampler2D uMeadow;
        uniform float uMeadowExt, uMeadowOn, uDry;
        uniform vec4 uTrail[${TRAIL_N}];
        uniform vec4 uTrailBox[${TRAIL_CH}];
        uniform vec4 uBend, uBendT, uBendS, uBendE;
        ${TRAIL_BEND_GLSL}
        ${dgTuftGlsl(opt, cut)}
        float meadowAt(vec2 xz) {
          if (uMeadowOn < 0.5) return 1.0;
          vec2 uv = xz / uMeadowExt + 0.5;
          if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
          return textureLod(uMeadow, uv, 0.0).r;
        }
        varying vec2 vUv;      // x across the fan's three cells, y up its rows
        varying vec4 vT;       // n (rows), hash, the meadow's density, the clump
        varying vec4 vLean;    // its tip's lean on the ground (xz, for the light), how laid, ao
        varying vec3 vRoot;
        varying vec3 vW;
        void main() {
          // this instance's cell: a window of the print's lattice round the focus (more of it up-screen)
          float fi = float(gl_InstanceID % ${W}), fj = float(gl_InstanceID / ${W});
          float r = floor(-uFocus.z / DG_SIZE.y) + fj - ${Math.round(H * 0.42)}.0;
          float cc = floor(uFocus.x / DG_SIZE.x + hash12(vec2(r, 3.7))) + fi - ${W / 2}.0;
          vec2 cellId = vec2(cc, r);
          vec2 p = dpCellCenter(cellId, DG_SIZE);
          vec4 sc = scorch4At(p);
          float d = meadowAt(p) * (1.0 - sc.x);
          float clump = dgClump(p);
          float hr;
          float n = d < 0.02 ? 0.0 : dgTuftN(cellId, dgHk(d, clump), dgShow(d), hr);
          // gone: none here, burnt, mown or torn out (the scorch map's A, the blades' own test), or the sword's cut
          float mown = step(fract(hr * 3.17 + 0.37) * 0.92 + 0.04, sc.w * ${GRASS.blade.gain.toFixed(3)});
          if (n < 1.0 || sc.x > 0.35 || mown > 0.5 || dgCutAt(p) > 0.5) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
          // the fan: three cells wide, n rows tall, standing on its root as the blades do
          float hgt = n * ${cell[1].toFixed(3)};
          vec3 root = vec3(p.x, 0.0, p.y);
          vec2 q = vec2(position.x * ${(cell[0] * 3).toFixed(3)}, position.y * hgt);
          vec3 wp = root + uCamRight * q.x + uBladeUp * q.y;
          // the wake bends it (the blades' own spring: along his way, out from his path, down, then up)
          vec4 tb = uBend.x > 0.5 ? trailBend(p, fract(hr * 5.71 + 0.11)) : vec4(0.0);
          vec3 off = vec3(tb.x, -uBendS.w * tb.w, tb.y) * hgt;
          wp += off * position.y * position.y;
          // (tufts side by side overlap at their tips: a hair nearer the eye by its hash, so one always wins)
          wp += normalize(uCamPos - wp) * (0.004 * hr);
          // its own lean (the comb, a little its own way), for the light
          float a = fract(hr * 7.31 + 0.19) * 6.2832;
          vec2 own = normalize(dgComb(p) * 0.8 + vec2(cos(a), sin(a)) * 0.6) * 0.15;
          // the tuft just in front (a row or two south) taller than it: its lower rows in that one's shade
          float ao = 0.0;
          for (int k = 1; k <= 2; k++) {
            float r2 = r - float(k);
            vec2 c2 = vec2(floor(p.x / DG_SIZE.x + hash12(vec2(r2, 3.7))), r2);
            float h2;
            float n2 = dgTuftN(c2, dgHk(d, clump), dgShow(d), h2);
            if (n2 >= float(k) + 1.0) ao = max(ao, 1.0 / float(k));
          }
          vUv = vec2(position.x + 0.5, position.y);
          vT = vec4(n, hr, d, clump);
          vLean = vec4(own + tb.xy * ${T.laid.toFixed(2)} * 3.0, clamp(tb.w, 0.0, 1.0), ao);
          vRoot = root;
          vW = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON_GLSL}
        ${DRAGON_PRINT_GLSL}
        ${DRAGON_PRINT_FX_GLSL}
        uniform float uDry;
        ${dgTuftGlsl(opt, cut)}
        const float DG_TIP3[3] = float[3](${tips});
        const float DG_LAY2[2] = float[2](${laid});
        varying vec2 vUv;
        varying vec4 vT;
        varying vec4 vLean;
        varying vec3 vRoot;
        varying vec3 vW;
        void main() {
          float n = vT.x;
          float col = clamp(floor(vUv.x * 3.0), 0.0, 2.0);
          float row = clamp(floor(vUv.y * n), 0.0, n - 1.0);
          float dx = col - 1.0;
          float top = n - 1.0;
          // the fan's cells: its root one, its body one or two (a side by its hash), its tips all three
          bool tipRow = row >= top && n >= 2.0;
          float side = fract(vT.y * 13.1 + row * 0.37) < 0.5 ? -1.0 : 1.0;
          bool inFan = tipRow || dx == 0.0 || (row > 0.0 && dx == side);
          if (!inFan) discard;
          vec2 f = vec2(fract(vUv.x * 3.0), fract(vUv.y * n));
          vec2 gc = vec2(vUv.x * 3.0, vUv.y * n);
          // lit as the print is: the moon on its lean, its shadow at this digit's height, the fire's light
          float s = top > 0.0 ? row / top : 1.0;
          vec2 ln = tipRow ? vec2(dx * ${T.lean.toFixed(2)}, -0.2) : vec2(0.0, -0.1 * s);
          ln += vLean.xy;
          vec3 N = normalize(vec3(ln.x, 1.0, ln.y));
          vec3 at = vRoot + vec3(0.0, (row + 0.5) * ${(cell[1] * 0.9).toFixed(3)}, 0.0);
          float sh = shadowAt(at) * dpCloud(vRoot.xz);
          vec3 PL = pointLights(at, N, 0.0);
          float t = smoothstep(uMoonDir.y - 0.3, uMoonDir.y + 0.25, max(dot(N, uMoonDir), 0.0)) * sh;
          float mx = uMoonDir.x / max(length(uMoonDir.xz), 1e-3);
          float tone0 = (s - 0.5) * ${S.tip.toFixed(2)} + (vT.w - 0.5) * ${S.clumpTone.toFixed(2)} * vT.z
            + ${S.side.toFixed(2)} * dx * mx - ${S.ao.toFixed(2)} * vLean.w * (1.0 - s);
          // laid by the wake: its whole length catches the moon (a sheen)
          tone0 += ${T.lit.toFixed(2)} * vLean.z;
          t = clamp(t * 0.85 + luma(PL) * 2.0 + tone0, 0.0, 1.0);
          t *= 1.0 - dpContact(vRoot.xz);
          float h = hash12(vec2(vT.y * 91.7 + col, row));
          float idx = dpGlyph(t, h);
          if (tipRow) idx = vLean.z > 0.55 ? DG_LAY2[fract(h * 3.1) < 0.6 ? 0 : 1] : DG_TIP3[int(col)];
          float m = glyphGrad(idx, f, dFdx(gc), dFdy(gc));
          vec3 L = ambientAt(vec3(0.0, 1.0, 0.0)) + uMoonColor * uMoonDir.y * sh * 0.85 + PL;
          vec3 body = mix(vec3(0.06, 0.062, 0.058), vec3(0.07, 0.11, 0.06), vT.z);
          body = mix(body, vec3(0.085, 0.08, 0.072), uDry) * (0.85 + 0.3 * fract(vT.y * 5.3));
          vec3 c = vec3(0.008, 0.01, 0.01) * L + body * (0.2 + 1.5 * t) * L * m * 1.15;
          gl_FragColor = vec4(applyFog(c, vW), 0.0);
        }
      `,
      blending: THREE.NoBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'dragonTufts';
  }
}
