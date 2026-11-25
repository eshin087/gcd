import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { FS_VERT, HERO_PARTS, LAYER_CASTER, LAYER_CASTER_RIGID, RIGID_VERT_GLSL } from './shaderLib.js';
import { rigidBones } from './rigidBatch.js';
import { createGridAtlas, createPixelArtAtlas, pixelArtCell, GRID_COLS, GRID_ROW } from './glyphs.js';
import { createWyrmArtAtlas, wyrmArtLadder, zoomArtStep } from './wyrmGlyphs.js';
import { HERO_ART } from './materials.js';
import { LET_GO_GLSL, letGoUniforms } from './letGo.js';
import { RIPPLE } from './impactRipple.js';
import { DP_RAMP } from './dragonPrint.js';
import { DP_TONE, DP_ART, dpPropsLook, dpTreesLook } from './dragonProps.js';
import { gis as dpGis } from './glyphs.js';

/** The time rip's live cuts at once (player/timeRip.js; the ASCII pass's uCutA / uCutB size). */
const CUT_SLOTS = 2;

// Frame pipeline:
//   0. one scene-graph matrix update, then the rigid batches' bone matrices (rigidBatch.js)
//   1. moon shadow map  (casters = objects on LAYER_CASTER, then the batched actors' shadow
//      meshes on LAYER_CASTER_RIGID with a depth material that reads the bone texture)
//   2. world -> sceneRT (HDR colour, alpha = ASCII flag, + depth texture)
//   2b. the hero alone -> seenRT, minus what the scene shows of him; the rest (the hero where
//      something covers him) is put back into sceneRT so the ASCII pass prints him through (ADR-106)
//   3. ASCII pass: flagged pixels become a screen-space character grid  -> compRT
//   (2b. the fire field: heat blobs -> a heat buffer -> a flame texture, one texel per art cell)
//   4. FX pass: the fire field's letters, then glyph particles, soft depth-tested against sceneRT
//      depth                                                                -> compRT
//   5. bloom + tone map + grade + vignette + feedback overlays             -> screen

export { LAYER_CASTER, LAYER_CASTER_RIGID };

/**
 * The letters follow the zoom (?zoomArt=a|b|c, read once at load; CONFIG.camera.zoomArt): b (the
 * default, the owner's pick of the three, 2026-11-16) the art cell and the screen grid shrink as the
 * camera pulls back past its default distance so an object keeps its letters, c half of that, a
 * the fixed letters the game had before. Pipeline.setZoomArt switches it live (the Lab, tests).
 */
export const ZOOM_ART = (() => {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? '').get('zoomArt');
    return v === 'a' || v === 'c' ? v : 'b';
  } catch {
    return 'b';
  }
})();
/** World radius (m) round the hero's screen point inside which the art pass draws his dark halo. */
const HERO_HALO_R = 2.1;
/** World half-size (m) of the box round his screen point that holds the whole drawn hero: his reach, the cloak, a leap. */
const HERO_BOX_R = 5;
/** GLSL: alpha `a` is one of the hero's part ids (materials.js HERO_ART; FLAG.ART_HERO = 0.48, FLAG.ART = 0.5). */
const IS_HERO_GLSL =
  'bool isSelf(float a) { return a > 0.42 && a < 0.45; } bool isHero(float a) { return (a > 0.46 && a < 0.49) || isSelf(a); }';
/**
 * The hero's letters follow his size (CONFIG.render.heroLetters): the cells (px) his own letter grid
 * may take, small to large. Even sizes only: at a half step (6 px: 1.5 screen px a font pixel) a
 * letter's strokes are 1 and 2 px wide; at a quarter step they smear.
 */
export const HERO_CELLS = [4, 6, 8, 10, 12, 16, 20, 24, 32];
/** A boss's letterBias (kit.letterBias) applies on a frame under this many pixels tall (a phone in
 *  landscape: 393, 343; at 720p and up the hero's rule already sizes the letters). */
export const BOSS_BIAS_H = 540;
/**
 * Make an object (and children) cast moon shadows. Works before or after rigid batching
 * (rigidBatch.js): a batched source keeps its layer mask without being drawn, and its actor's
 * shadow mesh casts for it (the bone sync puts that mesh on LAYER_CASTER_RIGID).
 */
export function markCaster(obj) {
  obj.traverse((o) => {
    if (!o.userData.rigidBatch) o.layers.enable(LAYER_CASTER);
  });
  return obj;
}

class FullscreenPass {
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.mesh = new THREE.Mesh(g);
    this.mesh.frustumCulled = false;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, material, target) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, this.camera);
  }
}

export class Pipeline {
  constructor(renderer, scene, fxScene, camera, U) {
    this.renderer = renderer;
    this.scene = scene;
    this.fxScene = fxScene;
    this.camera = camera;
    this.U = U;
    this.fs = new FullscreenPass();
    this.fxParticleMaterials = [];
    this.fire = null; // the fire field (registerFire)
    this.rtType = null;

    const canHalf = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    const type = canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rtType = type;
    const rt = (opts = {}) =>
      new THREE.WebGLRenderTarget(1, 1, { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...opts });

    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, {
      type,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    // --- the hero seen through what covers him (ADR-106). When the wyrm (or a tree, a pillar, a
    // landmark: anything drawn into the scene with depth) stands between the camera and the hero,
    // his letters are gone. So after the world pass the hero is drawn once more, alone, into seenRT
    // (only the box round him), a quad erases the pixels of him the scene already shows (a depth
    // test against the scene), and what is left (the hero exactly where he is covered) is put back
    // into the scene target over its cover. The ASCII pass draws those pixels as his usual line
    // art, in the blade's cyan (tSeen marks them). See _renderSeen.
    this.seenRT = new THREE.WebGLRenderTarget(1, 1, {
      type,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    this.seenRT.scissorTest = true; // only the box round the hero is ever cleared and drawn
    /** The object printed through what covers it (setSeenThrough), or null. */
    this.seenRoot = null;
    // The pass draws the hero a second time (a draw per material), so it only runs while a PROBE
    // finds something in front of him: one quad over his torso's screen rect, depth-tested against
    // the scene inside an occlusion query (_seenProbe). The answer comes a frame or two later;
    // `hold` counts the frames the pass still runs after the last yes. `off`: no usable queries
    // (or no GL context: the headless tests), the pass then runs every frame.
    this.seenGate = { gl: null, query: null, pending: false, age: 0, hold: 0, off: false };
    // (a restored GL context: the query object is gone, start over)
    renderer.domElement?.addEventListener?.('webglcontextrestored', () => {
      const G = this.seenGate;
      G.gl = G.query = null;
      G.pending = false;
    });
    this.compRT = rt();
    this.brightRT = rt();
    this.blur = [rt(), rt(), rt(), rt()];

    // --- shadows
    const S = CONFIG.render.shadowSize;
    /** Live shadow map size in texels (setShadowSize; the quality presets' `shadow`). */
    this.shadowSize = S;
    this.shadowRT = new THREE.WebGLRenderTarget(S, S, {
      depthTexture: new THREE.DepthTexture(S, S),
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    const E = CONFIG.render.shadowExtent;
    this.shadowCam = new THREE.OrthographicCamera(-E, E, E, -E, 1, 320);
    this.shadowCam.layers.set(LAYER_CASTER);
    this.shadowMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
    // rigid batches (rigidBatch.js): the same depth, each vertex placed by its bone's matrix
    this.rigid = rigidBones(U);
    this.rigidShadowMat = new THREE.ShaderMaterial({
      uniforms: { uBoneTex: U.uBoneTex },
      vertexShader: /* glsl */ `
        ${RIGID_VERT_GLSL}
        void main() {
          gl_Position = projectionMatrix * viewMatrix * (rigidMatrix() * vec4(position, 1.0));
        }
      `,
      fragmentShader: /* glsl */ `
        void main() {
          gl_FragColor = vec4(1.0); // only the depth texture is read
        }
      `,
      side: THREE.DoubleSide,
    });
    this.rigidShadowMat.index0AttributeName = 'position';
    this.shadowBias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    U.uShadowMap.value = this.shadowRT.depthTexture;
    this.shadowCenter = new THREE.Vector3();

    // --- ASCII grid pass (see FLAG in materials.js and GRID_ROW in glyphs.js)
    this.cell = new THREE.Vector2(7, 12);
    this.grid = null;
    // the wyrm's ASCII-art grid (FLAG.ART): fine pixel-font digits, 5x8 px at 720p (wyrmGlyphs.js)
    this.artCell = new THREE.Vector2(5, 8);
    this.artFont = '';
    this.art = null;
    // the zoom ladder (?zoomArt): the art fonts / grid cells this frame size may step down to, built
    // in setSize (atlases ahead of time: a step only swaps uniforms), and the step drawn now
    this.zoomArt = ZOOM_ART;
    this.zoomLadder = [];
    this.zoomStep = 0;
    this._zoomHs = [];
    this._gridCache = new Map();
    // the hero's own, finer grid: a 3x3 micro-font in square 4x4 cells (x2 from 2160 px tall): the
    // reference's dot matrix, and ~28 rows of it down his figure at the game camera
    this.heroCell = new THREE.Vector2(4, 4);
    this.heroArt = null;
    // ... and the player's own (it follows his size on screen: _updateHeroLetters)
    this.selfCell = new THREE.Vector2(4, 4);
    this._selfArt = new Map(); // cell px -> atlas
    /** One letter cell of the hero in metres at his depth (CONFIG.render.heroLetters.size; the Lab / captures set it live). */
    this.heroLetter = CONFIG.render.heroLetters?.size ?? 0;
    // ... and a boss's whose kit asks for it (`bossLetters`, set each frame by main.js: _updateBossLetters)
    this.bossLetters = false;
    // ... that many cells bolder on a small frame (the kit's `letterBias`, main.js; 0 = none)
    this.bossLetterBias = 0;
    this.bossCell = new THREE.Vector2(0, 0);
    this._bossOn = false;
    this.asciiMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        tDepth: { value: this.sceneRT.depthTexture },
        tGrid: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uCell: { value: this.cell },
        uGridCols: { value: GRID_COLS },
        uGridRows: { value: Object.keys(GRID_ROW).length },
        uGain: { value: 2.4 },
        uBg: { value: 0.16 },
        uLumMap: { value: 13.0 },
        uCreatureGain: { value: 1.8 },
        uCreatureLum: { value: 3.0 },
        uCreatureBg: { value: 0.04 }, // dark cell backing: bright inks must not fill their cells
        uInvViewProj: { value: new THREE.Matrix4() },
        uNear: { value: 1 },
        uFar: { value: 200 },
        tArt: { value: null },
        uArtCell: { value: this.artCell },
        tHeroArt: { value: null },
        uHeroCell: { value: this.heroCell },
        // the PLAYER's own letter grid (his pixels carry their own alpha window: materials.js
        // HERO_ART.self): its atlas, its cell (px) and its font pixel (px: the ink lines' width, the
        // halo's reach), all three set by _updateHeroLetters so he keeps about the same number of
        // letters on every screen and at every camera distance; uSelfBox = the box round his
        // screen point that holds him (xy centre px, z half-size px, w = 1 once it is known)
        tSelfArt: { value: null },
        uSelfCell: { value: this.selfCell },
        uSelfPx: { value: 1 },
        uSelfBox: { value: new THREE.Vector4(0, 0, 0, 0) },
        uHeroCount: { value: 29 }, // glyphs in the hero atlas (sparse → dense), set in setSize
        uHeroCols: { value: 29 }, // hero atlas columns
        // The hero as INK-LINE ART on a DOT MATRIX (the owner's reference): thin ink lines where his
        // silhouette, a depth step (the nearer side) or a part edge (the higher part, HERO_ART ids)
        // runs, over a regular grid of tiny marks whose brightness and weight carry the tone.
        // ink: x / y = line brightness in dark / lit cells (under the bloom threshold: plain lines do
        // not glow, only parts with an ink gain > 1 do), z = how much of the part's hue a line keeps
        // (0 = white), w = fill left on the far side of a depth step (the dark gap beside a line)
        uHeroInk: { value: new THREE.Vector4(0.4, 0.55, 0.62, 0.45) },
        // fill: x / y = mark brightness at the dark / lit end (linear in the cell's light value v),
        // z / w = glyph-ramp position there (the reference's cloth: charcoal dots, lit ≈ 110 / 255,
        // shadow ≈ 50, occluded gaps black)
        uHeroFill: { value: new THREE.Vector4(0.012, 0.34, 0.3, 1.0) },
        // inner lines are dimmer than the silhouette: brightness × x at a depth step, × y at a part edge,
        // × z between pieces of one part
        uHeroLine: { value: new THREE.Vector3(0.9, 0.75, 0.55) },
        // a crease line where a cell is lit brighter than its neighbour (same part): luma > n × x + y
        uHeroCrease: { value: new THREE.Vector2(1.7, 0.035) },
        // distance LOD by view depth (m): x / y = where the far look starts / is complete (the game
        // camera is 24–54 m, phones 14–34 m; the Lab's close-ups 1.5–5 m), z = fill brightness there,
        // w = line brightness there (parts whose ink gain is > 1.5 keep theirs: blade, gem, flask).
        // Far away the creases and piece edges drop out (dithered per cell) and part edges dim.
        // (each part scales the fill by its own far gain and keeps its own share of line light:
        // uHeroPartFill .w / .z; the silhouette keeps at least w: a dim, cool rim round the cloth)
        uHeroLod: { value: new THREE.Vector4(6.0, 20.0, 1.3, 0.25) },
        // ... and the far look's letters: x / y = the letter-ramp position at the dark / lit end there
        // (dense letters: a body of solid dark texture, not a scatter of digits), z = their per-cell
        // ramp jitter there, w = the most HDR a glowing part keeps there (the blade's bloom stays a
        // tight glow round a crisp cyan line, not a blur over half the figure)
        // (lean reference match: w 1.8 → 1.3, the blade's halo at the game camera was a wide blur
        // over his body and the grass; the reference's blade is a crisp cyan line with a tight glow)
        uHeroFar: { value: new THREE.Vector4(0.45, 0.85, 1.0, 1.3) },
        // look-dev: 1 = show the hero's raw art source (fill) instead of letters, 2 = only the ink
        // lines, 3 = the ink lines coloured by class (silhouette, depth step, part edge, piece)
        uHeroDebug: { value: 0 },
        // the per-pixel ink lines: x = pixel step to the neighbours (the line width: the pixel-font
        // scale, set in setSize), y = relative depth jump that is a depth step (0.0015 = 5 cm at the
        // 36 m camera, 0.7 cm in a 4.7 m close-up), z = letter brightness left in a cell an edge runs
        // through, up close (its dark channel), w = brightness of the line's second, softer pixel up
        // close (0 = one pixel wide)
        uHeroPx: { value: new THREE.Vector4(1, 0.0015, 0.5, 0.3) },
        // a dark halo round the hero over the world grid (the reference figure carries its black
        // ground with it, so he cuts out of the grass at the game camera): xy = his screen centre
        // (uv), z = the radius (px) inside which pixels look for him, w = 0 (none) .. 1 its strength;
        // set per frame in _updateAsciiCamera from U.uPlayerScreen
        uHeroHalo: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },
        // halo shape: x / y = tap radii (px, × the pixel-font scale), z = darkening at full strength,
        // w = the view depth (m) where it reaches full strength (it fades in from w × 0.4)
        uHeroHaloShape: { value: new THREE.Vector4(2, 4, 0.72, 20) },
        // each hero part's ink-line tint (rgb) × gain (a), from HERO_INK (player/model.js)
        uHeroPartInk: U.uHeroPartInk ?? { value: Array.from({ length: HERO_PARTS }, () => new THREE.Vector4(1, 1, 1, 1)) },
        // ... and each part's letter-fill brightness (x), line style (y: 0 a stroke per cell, 1 dotted,
        // 2 unbroken), how much of its inner lines' light stays far away (z) and its far fill gain (w)
        // (y + 4: an 'open' part, its marks stay lit beside an edge; y + 8: its SILHOUETTE prints dotted)
        uHeroPartFill: U.uHeroPartFill ?? { value: Array.from({ length: HERO_PARTS }, () => new THREE.Vector4(1, 0, 0, 1)) },
        // ... and each part's silhouette ink (where it borders the world): rgb tint × gain (a). The
        // reference's cloth has a dim blue-lavender dotted outline, its armour a white one
        uHeroPartRim: U.uHeroPartRim ?? { value: Array.from({ length: HERO_PARTS }, () => new THREE.Vector4(1, 1, 1, 1)) },
        // ... and the player's own three (shaderLib.js uSelfPart*)
        uSelfPartInk: U.uSelfPartInk ?? { value: Array.from({ length: HERO_PARTS }, () => new THREE.Vector4(1, 1, 1, 1)) },
        uSelfPartFill: U.uSelfPartFill ?? { value: Array.from({ length: HERO_PARTS }, () => new THREE.Vector4(1, 0, 0, 1)) },
        uSelfPartRim: U.uSelfPartRim ?? { value: Array.from({ length: HERO_PARTS }, () => new THREE.Vector4(1, 1, 1, 1)) },
        // per creature kind: x = hero (FLAG.ART_HERO), y = wyrm / other (FLAG.ART)
        // hero: uArtLum.x / uArtBlack.x map his flat art fill (HERO_INK) to the light value v that picks
        // his fill letters and brightness (uHeroFill); uArtMin.x is unused since the ink-line pass
        uArtLum: { value: new THREE.Vector2(3.0, 4.5) }, // brightness -> ramp position: 1 - exp(-luma * k)
        uArtBlack: { value: new THREE.Vector2(0.06, 0.0) }, // source luma treated as black (contrast)
        uArtMin: { value: new THREE.Vector2(0.14, 0.3) }, // glyph value at the dark end of the ramp
        uArtMax: { value: 0.8 }, // glyph value at the bright end (tone-maps to white without bloom haloes)
        uArtDither: { value: new THREE.Vector2(5.0, 1.6) }, // per-cell ramp jitter (glyphs): variety
        // relative depth jump that marks a part boundary (arm over coat, leg over leg). Wyrm (.y): cells
        // spanning it go black (0 = off). Hero (.x): beyond the slope a neighbour predicts, it draws an
        // ink line on the nearer side and a dim gap on the far one (0.004 = 0.14 m at the 36 m camera).
        uArtEdge: { value: new THREE.Vector2(0.004, 0.0) },
        // ---- the wyrm's letters (wyrmCell; pixel-font digits from wyrmGlyphs.js, ADR-093). Its .y uniforms above
        // map the source: black point, 1 - exp(-luma * k), min brightness, dither, part-gap depth.
        // x = brightest letter, y = brightness gamma (dim charcoal body, bright rims), z = v below
        // which a cell prints nothing (the black gaps between scales), w = how much each stroke
        // pixel takes its own source pixel instead of the cell average (crisp shapes through text)
        // (ADR-093: back to the calm charcoal of the fine digits after the bright large letters of
        // ADR-092 read as "way too flashy": a dim body, bright letters only where a rim or tip is lit)
        uWyrmTone: { value: new THREE.Vector4(0.95, 1.3, 0.022, 0.85) },
        // glyph pick: x / y = cell value v where the letter set steps dim -> mid -> bright (the cell's
        // hash picks the letter inside its set, so letters hold still while the wyrm moves), z = per-
        // cell dither of those steps (no contour lines), w = samples (of 4) a stroke code needs to
        // turn the cell into a stroke glyph
        uWyrmGlyph: { value: new THREE.Vector4(0.12, 0.42, 0.08, 1) },
        // atlas columns (wyrmGlyphs.js): mid set start, bright set start, stroke start, glyphs in the row
        uWyrmAtlas: { value: new THREE.Vector4(10, 20, 28, 32) },
        // the art letters' brightness at a zoom ladder step (?zoomArt): the frame size's own font's ink
        // over this font's (a smaller font fills more of its cell), so an object keeps its tone as its
        // letters shrink; 1 at step 0 (option a, the default zoom)
        uArtInk: { value: 1 },
        uWyrmOutline: { value: 1 }, // 1: silhouette cells draw their edge as a stroke glyph
        // the wyrm's grid is anchored to its own screen position (px, set per frame from
        // U.uBossScreen): its letters travel with it when the camera pans or it walks, instead of
        // the body sliding under a fixed grid and re-lettering every cell (ADR-092)
        uWyrmAnchor: { value: new THREE.Vector2(0, 0) },
        // the fire field's flame texture, one texel per art cell (fireField.js: r heat * 0.4, g smoke,
        // b a letter roll, a kind + stroke), and uFlame = cells x, cells y, 1 while something burns
        tFlame: { value: null },
        uFlame: { value: new THREE.Vector4(1, 1, 0, 0) },
        // the fire field's cells drawn this frame (its texture may be larger: the zoom ladder's
        // finest step); the haze clamps its look-ups to them
        uFlameCells: { value: new THREE.Vector2(1, 1) },
        // HEAT HAZE: the letters of the wyrm and the background objects re-roll and shimmer where the
        // fire field is hot at, under or beside their cell, as if the heat boiled the text (read only
        // while something burns: uFlame.z). x / y = the heat (as the fire field counts it: ~0.4 a
        // cool rim, ~1 a body) where the haze starts / is whole, z = how much of the fire's colour
        // the letters take, w = the shimmer: px a letter slides sideways in a wave that climbs
        uHaze: { value: new THREE.Vector4(0.03, 0.5, 0.5, 1) },
        // ... x = share of the cells that re-roll at full haze (each on the fire's own beat: the roll
        // in tFlame.b), y = brightness flicker, z = the warm lift on dark letters
        uHazeRoll: { value: new THREE.Vector3(0.7, 0.3, 0.035) },
        // ... the colour the letters take beside the void slot's heat (violet; a level that swaps the
        // slot's palette swaps it too: FireField.setPalette shares its vector here, registerFire)
        uHazeVoid: { value: new THREE.Vector3(0.62, 0.34, 1.0) },
        // THE IMPACT RIPPLE (impactRipple.js): a landed cut's pressure wave through the struck boss's
        // letters. uRipN = live hits (0: the pass reads nothing); per hit uRipA = contact px (x, y),
        // the front's radius (cells), its weight; uRipB = the shove px along the cut (x, y), the
        // front's half-width (cells), the contact's view depth (m); uRipC = the outward push px, the
        // quiet hole round the contact and its ramp (cells); uRip = the preset's roll, bright, depth
        // window (m), lift; uRip2 = its trough, the trough's lag (half-widths), the stroke share
        // (all set by ImpactRipple.write)
        uRipN: { value: 0 },
        uRipA: { value: Array.from({ length: RIPPLE.slots }, () => new THREE.Vector4()) },
        uRipB: { value: Array.from({ length: RIPPLE.slots }, () => new THREE.Vector4(0, 0, 1, 1)) },
        uRipC: { value: Array.from({ length: RIPPLE.slots }, () => new THREE.Vector4()) },
        uRip: { value: new THREE.Vector4(0, 0, 6, 0) },
        uRip2: { value: new THREE.Vector4() },
        // THE TIME RIP (player/timeRip.js; ?rip=strip | negative): a flash cut's thin band of the
        // printed letters, for two or three frames. uCutN = live cuts (0: the pass reads nothing); per
        // cut uCutA = its two ends (frame px, y up), uCutB = (1 strip | 2 negative, the band's
        // half-width in art cells, the strip's shift in cells, the negative's weight); uCutTone = the
        // negative's pale cell (rgb) and w: a pixel brighter than the scene x uBg x w is a letter's
        // stroke (printed dark) (all set by TimeRip.write)
        uCutN: { value: 0 },
        uCutA: { value: Array.from({ length: CUT_SLOTS }, () => new THREE.Vector4()) },
        uCutB: { value: Array.from({ length: CUT_SLOTS }, () => new THREE.Vector4()) },
        uCutTone: { value: new THREE.Vector4(0.46, 0.5, 0.56, 2.5) },
        uTime: U.uTime ?? { value: 0 },
        // LETTING GO (letGo.js): the dying wyrm's letters let go cell by cell and fall; shared with
        // its materials (uWyrmGrid: the art cell and the grid anchor; uWyrmLetGo.x: 0 = off)
        ...letGoUniforms(U),
        // a falling letter: x = how much it takes the ember colour as it falls, y = its brightness
        // floor (a dim charcoal letter still reads while it falls), z = how dark the body behind it
        // goes (its backing), w = brightness of the ember colour
        uLetGoInk: { value: new THREE.Vector4(0.85, 0.1, 0.7, 0.55) },
        // extra source taps per wyrm cell (a 4x4 grid) on top of the 4 that find the cell: the cell's
        // letter TIER comes from the average of its source, so it does not flip between bright and
        // dark letters as scale rims cross its four point samples (0 = off); each letter pixel still
        // takes uWyrmTone.w of its own source pixel, which is what draws the scale edges through it
        uWyrmTaps: { value: 1 },
        // ---- background props (FLAG.ART_PROP, ADR-100): printed like the wyrm, in its letters and
        // its cell, with their own tone. uPropTone: x brightest letter, y gamma, z value below which
        // a cell prints nothing (0: EVERY cell of an object prints a letter), w own-pixel share.
        // uPropGlyph: x / y set steps dim -> mid -> bright, z per-cell dither. uPropLum: x black
        // point, y curve 1 - exp(-luma * y), z brightness of the dimmest letter.
        uPropTone: { value: new THREE.Vector4(0.9, 1.3, 0.0, 0.7) },
        uPropGlyph: { value: new THREE.Vector4(0.16, 0.48, 0.08, 0) },
        uPropLum: { value: new THREE.Vector3(0.0, 9.0, 0.085) },
        // x = brightness of the outline's stroke glyphs against the body (the object's edge is drawn
        // in characters, a little brighter than what it encloses), y = relative depth step inside an
        // object that draws an inner outline stroke (0 = none), z = brightness of those
        uPropOutline: { value: new THREE.Vector3(1.9, 0.012, 1.35) },
        // the props' grid is counted from the GROUND: the screen position a fixed world point would
        // have at the camera's focus (px, set per frame), so letters stay on an object while the
        // camera follows the hero (exact at the focus depth, a slow drift nearer and farther)
        uPropAnchor: { value: new THREE.Vector2(0, 0) },
        // ---- THE DRAGON PRINT on props and trees (render/dragonProps.js; ?dpProps, ?dpTrees): x = the props, y =
        // the trees (1 on). Their cells print the dragon ground's digits (DP_RAMP) from the WORLD atlas (the
        // ground's own letters) by the tone their source carries in alpha (DP_TONE), in its ink. uDpArtInk / uDpLegacy:
        // dragonProps.js DP_ART
        uDpOn: { value: new THREE.Vector2(dpPropsLook() !== '0' ? 1 : 0, dpTreesLook() !== '0' ? 1 : 0) },
        tDpAtlas: U.uGlyphAtlas,
        uDpDigs: { value: dpGis(DP_RAMP) },
        uDpTone: { value: new THREE.Vector3(DP_TONE.a0, DP_TONE.span, DP_TONE.top) },
        uDpLeaf: { value: new THREE.Vector2(DP_TONE.leaf0, DP_TONE.leafSpan) },
        uDpArtInk: { value: new THREE.Vector4(...DP_ART.ink) },
        uDpBack: { value: new THREE.Vector4(...DP_ART.back) },
        uDpLegacy: { value: new THREE.Vector4(...DP_ART.legacy) },
        // ---- the hero seen through what covers him (ADR-106). tSeen = seenRT: the hero's pixels
        // that something stands in front of (their alpha is in the hero's window), and nothing else
        tSeen: { value: this.seenRT.texture },
        // xy = his screen centre (uv), z = the half-size (px) of the box round him that seenRT holds
        // this frame, w = 1 while the pass ran (0: tSeen is not read); set per frame in _renderSeen
        uSeen: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },
        // his covered parts print in his blade's cyan: his own colour, and one neither the wyrm's
        // fire nor a tell (red glow, white glint) uses
        uSeenInk: { value: new THREE.Vector3(0.3, 0.86, 1.0) },
        // x = brightness of his silhouette line there, y / z = gain on his inner lines / his fill
        // letters (× his own art's brightness, capped at 1.3: the blade keeps a little glow), w =
        // how dark the gap round him is over the wyrm's letters (the two rings of uHeroHaloShape)
        uSeenTone: { value: new THREE.Vector4(1.15, 1.6, 1.2, 0.85) },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        // every texture this pass reads is a screen target or a letter atlas, without mip levels:
        // level 0 by name, so no lookup needs screen derivatives (the hero branch runs twice, once
        // for the player and once for the bosses, and a derivative lookup inside it made the HLSL
        // compiler warn about gradients in a loop)
        #undef texture2D
        #define texture2D(s, uv) textureLod(s, uv, 0.0)
        uniform sampler2D tScene;
        uniform sampler2D tDepth;
        uniform sampler2D tGrid;
        uniform vec2 uRes;
        uniform vec2 uCell;
        uniform float uGridCols;
        uniform float uGridRows;
        uniform float uGain;
        uniform float uBg;
        uniform float uLumMap;
        uniform float uCreatureGain;
        uniform float uCreatureLum;
        uniform float uCreatureBg;
        uniform mat4 uInvViewProj;
        uniform float uNear;
        uniform float uFar;
        uniform sampler2D tArt;
        uniform vec2 uArtCell;
        uniform sampler2D tHeroArt;
        uniform vec2 uHeroCell;
        uniform sampler2D tSelfArt;
        uniform vec2 uSelfCell;
        uniform float uSelfPx;
        uniform vec4 uSelfBox;
        uniform float uHeroCount;
        uniform float uHeroCols;
        uniform vec4 uHeroInk;
        uniform vec4 uHeroFill;
        uniform vec3 uHeroLine;
        uniform vec2 uHeroCrease;
        uniform vec4 uHeroLod;
        uniform vec4 uHeroFar;
        uniform float uHeroDebug;
        uniform vec4 uHeroPx;
        uniform vec4 uHeroHalo;
        uniform vec4 uHeroHaloShape;
        uniform vec4 uHeroPartInk[${HERO_PARTS}];
        uniform vec4 uHeroPartFill[${HERO_PARTS}];
        uniform vec4 uHeroPartRim[${HERO_PARTS}];
        uniform vec4 uSelfPartInk[${HERO_PARTS}];
        uniform vec4 uSelfPartFill[${HERO_PARTS}];
        uniform vec4 uSelfPartRim[${HERO_PARTS}];
        uniform vec2 uArtLum;
        uniform vec2 uArtBlack;
        uniform vec2 uArtMin;
        uniform float uArtMax;
        uniform vec2 uArtDither;
        uniform vec2 uArtEdge;
        uniform vec4 uWyrmTone;
        uniform vec4 uWyrmGlyph;
        uniform vec4 uWyrmAtlas;
        uniform float uArtInk;
        uniform float uWyrmOutline;
        uniform vec2 uWyrmAnchor;
        uniform float uWyrmTaps;
        uniform vec4 uPropTone;
        uniform vec4 uPropGlyph;
        uniform vec3 uPropLum;
        uniform vec3 uPropOutline;
        uniform vec2 uPropAnchor;
        uniform vec2 uDpOn;
        uniform sampler2D tDpAtlas;
        uniform float uDpDigs[${DP_RAMP.length}];
        uniform vec3 uDpTone;
        uniform vec2 uDpLeaf;
        uniform vec4 uDpArtInk;
        uniform vec4 uDpBack;
        uniform vec4 uDpLegacy;
        uniform sampler2D tFlame;
        uniform vec4 uFlame;
        uniform vec2 uFlameCells;
        uniform vec4 uHaze;
        uniform vec3 uHazeRoll;
        uniform vec3 uHazeVoid;
        uniform float uRipN;
        uniform vec4 uRipA[${RIPPLE.slots}];
        uniform vec4 uRipB[${RIPPLE.slots}];
        uniform vec4 uRipC[${RIPPLE.slots}];
        uniform vec4 uRip;
        uniform vec4 uRip2;
        uniform float uCutN;
        uniform vec4 uCutA[${CUT_SLOTS}];
        uniform vec4 uCutB[${CUT_SLOTS}];
        uniform vec4 uCutTone;
        uniform float uTime;
        uniform vec4 uLetGoInk;
        ${LET_GO_GLSL}
        uniform sampler2D tSeen;
        uniform vec4 uSeen;
        uniform vec3 uSeenInk;
        uniform vec4 uSeenTone;
        varying vec2 vUv;
        // heat haze, set per cell by hazeCell before artLetters prints it: x = 0..1 how deep the cell
        // is in the heat, y = the fire's letter roll for it, z = 1 violet (void fire), w = shimmer px
        vec4 gHaze = vec4(0.0);
        // the impact ripple, set per BOSS cell by rippleCell (uRipN > 0 only): xy = the whole px the
        // cell is moved, z = the front's weight at the cell, w = the trough's; gRipS = the stroke
        // (0 '-', 1 '/', 2 '|', 3 '\\') the cell prints along the front, -1 none
        vec4 gRip = vec4(0.0);
        float gRipS = -1.0;
        // the time rip (uCutN > 0 only, cutBand): gCutPx = the pixel this one prints (a strip's band
        // reads the letters a few whole cells along the cut), gCutNeg = how far it prints in negative
        vec2 gCutPx = vec2(0.0);
        float gCutNeg = 0.0;

        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        // glyph mask from the pixel-exact grid atlas (row 0 at the top of the canvas)
        float glyphAt(float row, float col, vec2 local) {
          vec2 auv = vec2((col + local.x) / uGridCols, (uGridRows - 1.0 - row + local.y) / uGridRows);
          return texture2D(tGrid, auv).a;
        }
        float linDepth(vec2 uv) {
          float z = texture2D(tDepth, uv).r * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }
        vec3 worldAt(vec2 uv) {
          float d = texture2D(tDepth, uv).r;
          vec4 w = uInvViewProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          return w.xyz / w.w;
        }
        bool isStone(float a) { return a > 0.8; }

        // ---- stone: luminance ramp + outline glyphs on silhouettes and depth steps
        vec3 stoneCell(vec4 c, vec2 cell, vec2 local) {
          vec2 cuv = (cell + 0.5) * uCell / uRes;
          vec2 dx = vec2(uCell.x, 0.0) / uRes, dy = vec2(0.0, uCell.y) / uRes;
          float sL = isStone(texture2D(tScene, cuv - dx).a) ? 1.0 : 0.0;
          float sR = isStone(texture2D(tScene, cuv + dx).a) ? 1.0 : 0.0;
          float sD = isStone(texture2D(tScene, cuv - dy).a) ? 1.0 : 0.0;
          float sU = isStone(texture2D(tScene, cuv + dy).a) ? 1.0 : 0.0;
          float dC = linDepth(cuv);
          float jx = (linDepth(cuv + dx) - linDepth(cuv - dx)) / dC;
          float jy = (linDepth(cuv + dy) - linDepth(cuv - dy)) / dC;
          float gx = (sR - sL) + clamp(jx * 6.0, -1.0, 1.0) * step(0.035, abs(jx));
          float gy = (sU - sD) + clamp(jy * 6.0, -1.0, 1.0) * step(0.035, abs(jy));
          float h = hash12(cell);
          float lum = luma(c.rgb);
          // outline only stones that stand above the ground (flagstones stay pure texture)
          bool raised = worldAt(cuv).y > 0.22;
          if (raised && abs(gx) + abs(gy) > 0.9) {
            float orient = abs(gx) > 2.0 * abs(gy) ? 0.0 : abs(gy) > 2.0 * abs(gx) ? 1.0 : (gx * gy > 0.0 ? 3.0 : 2.0);
            float m = glyphAt(7.0, orient * 4.0 + floor(h * 4.0), local);
            return mix(c.rgb * uBg, c.rgb * uGain * 1.35 + vec3(0.01), m);
          }
          float l = 1.0 - exp(-lum * uLumMap);
          float level = clamp(floor(l * 14.0), 0.0, 13.0);
          float m = glyphAt(0.0, level * 4.0 + floor(h * 4.0), local);
          return mix(c.rgb * uBg, c.rgb * uGain, m);
        }

        // ---- creature: glyph oriented along the encoded surface flow
        vec3 creatureCell(vec4 c, vec2 cell, vec2 local) {
          float code = clamp(floor((c.a - 0.04) / 0.37 * 96.0), 0.0, 95.0);
          float set = floor(code / 24.0);
          float ang = (code - set * 24.0) / 24.0 * 6.2831853;
          float l = 1.0 - exp(-luma(c.rgb) * uCreatureLum);
          float m;
          if (set > 2.5) {
            float level = clamp(floor(l * 14.0), 1.0, 13.0);
            m = glyphAt(6.0, level * 4.0 + floor(hash12(cell) * 4.0), local);
          } else {
            float level = clamp(floor(l * 7.0), 1.0, 6.0);
            float dir = mod(floor(ang / 0.7853982 + 0.5), 8.0);
            m = glyphAt(3.0 + set, level * 8.0 + dir, local);
          }
          return mix(c.rgb * uCreatureBg, c.rgb * uCreatureGain, m);
        }

        ${IS_HERO_GLSL}
        bool isArt(float a) { return (a > 0.46 && a < 0.55) || isSelf(a); }
        bool isProp(float a) { return a > 0.555 && a < 0.585; } // FLAG.ART_PROP = 0.57
        // ---- THE DRAGON PRINT on props and trees (render/dragonProps.js). What the prop branch makes of a sample:
        // 0 nothing of its; 1 a prop printed in the wyrm's letters (as before the switches); 2 the dragon print (a
        // source that carries its tone, a prop under ?dpProps, a tree of the screen grid under ?dpTrees)
        float propKind(float a) {
          if (a > 0.555 && a < uDpTone.z) return 2.0;
          if (a > uDpLeaf.x - 0.005 && a < uDpLeaf.x + uDpLeaf.y + 0.005) return 2.0;
          if (a > 0.555 && a < 0.585) return uDpOn.x > 0.5 ? 2.0 : 1.0;
          if (uDpOn.y > 0.5 && (abs(a - 0.6) < 0.012 || a > 0.95)) return 2.0;
          return 0.0;
        }
        // a sample's ink (rgb) and tone (a): decoded, or (a source without it: the ascii-object material) read from
        // its brightness
        // a crown's leaves (their own window, uDpLeaf; the screen grid's FLAG.LEAF): no outline, a ragged edge
        bool dpLeafA(float a) { return (a > uDpLeaf.x - 0.005 && a < uDpLeaf.x + uDpLeaf.y + 0.005) || abs(a - 0.6) < 0.012; }
        vec4 dpSample(vec4 s) {
          if (s.a < uDpTone.z) return vec4(s.rgb, clamp((s.a - uDpTone.x) / uDpTone.y, 0.0, 1.0));
          if (s.a > uDpLeaf.x - 0.005 && s.a < uDpLeaf.x + uDpLeaf.y + 0.005) return vec4(s.rgb, clamp((s.a - uDpLeaf.x) / uDpLeaf.y, 0.0, 1.0));
          vec2 k = s.a > 0.585 ? uDpLegacy.zw : uDpLegacy.xy;
          return vec4(s.rgb * k.x, 1.0 - exp(-luma(s.rgb) * k.y));
        }
        // a glyph of the world atlas (the ground's own letters) over an art cell, at the ground's minification
        // (local: 0..1 in the cell, y up)
        float dpAtlas(float idx, vec2 local) {
          vec2 uv = clamp(local, 0.03, 0.97);
          vec2 a = vec2((mod(idx, 16.0) + uv.x) / 16.0, (7.0 - floor(idx / 16.0) + uv.y) / 8.0);
          return textureGrad(tDpAtlas, a, vec2(1.0 / (16.0 * uArtCell.x), 0.0), vec2(0.0, 1.0 / (8.0 * uArtCell.y))).a;
        }
        float dpDig(int i) { float r = uDpDigs[0]; for (int k = 0; k < ${DP_RAMP.length}; k++) if (k == i) r = uDpDigs[k]; return r; }
        // a cell of the dragon print: the ramp's digit for its tone (neighbouring levels jittered by the cell's
        // hash, as dragonPrint.js dpGlyph), in its ink; an outline cell its stroke (0 '-', 1 '/', 2 '|', 3 back-
        // slash), sgain brighter and never dimmer than uDpArtInk.z x its hue (a shadowed face keeps its edge).
        // Over a backing of the ground's near-black soil
        vec3 dpPropCell(vec3 ink, float t, vec2 cell, vec2 local, float stroke, float sgain) {
          float h = hash12(cell * 1.37 + 11.0);
          float hz = gHaze.x;
          bool boil = hz > 0.0 && hash12(cell * 0.53 + 7.9) < hz * uHazeRoll.x;
          if (boil) h = fract(h + gHaze.y);
          float m;
          if (stroke >= 0.0) {
            // (the outline in the props' own crisp strokes, the wyrm's pixel font: the ground has none to
            // match, and the world atlas's hairlines at this size print at half their ink)
            m = texture2D(tArt, vec2((uWyrmAtlas.z + stroke + local.x) / uWyrmAtlas.w, local.y)).a * uArtInk;
            float mx = max(max(ink.r, ink.g), ink.b);
            ink = max(ink * sgain, ink / max(mx, 1e-4) * uDpArtInk.z);
          } else {
            m = dpAtlas(dpDig(int(clamp(t * ${(DP_RAMP.length - 1).toFixed(1)} + (h - 0.5) * 1.5, 0.0, ${(DP_RAMP.length - 1).toFixed(1)}))), local);
          }
          if (hz > 0.0) {
            vec3 warm = gHaze.z > 0.5 ? uHazeVoid : vec3(1.0, 0.46, 0.14);
            float fl = boil ? 1.0 + (gHaze.y - 0.5) * 2.0 * uHazeRoll.y : 1.0;
            ink = mix(ink, warm * (luma(ink) * 1.25 + uHazeRoll.z), hz * uHaze.z) * fl;
          }
          // (the backing: the ground's near-black soil between the strokes, lifted a little by the ink)
          vec3 back = uDpBack.xyy + ink * uDpBack.w;
          return mix(back, ink * uDpArtInk.w, m);
        }

        // ---- the wyrm (FLAG.ART): fine pixel-font digits on black (wyrmGlyphs.js atlas in tArt; ADR-093).
        // The letter is picked per cell: its average source picks a letter SET (a dark cell prints
        // nothing; dim / mid / bright sets, the steps dithered per cell), the cell's own hash picks the
        // letter inside it, so the letters hold still while the wyrm moves under them (the owner's
        // reference prints whole letters even in the dark parts). Its strokes take brightness and hue
        // from their OWN pixel of the source (cp, blended by uWyrmTone.w): in the reference a bright
        // scale edge cuts crisply through the letters, so the shapes survive the text. Brightness
        // goes through a black point and a gamma (dim charcoal hide, bright rims); saturated HDR
        // sources (lava, eyes) bloom.
        // stroke >= 0: the material marked this cell as a scale rim / thin part running in that screen
        // direction (0 '-', 1 '/', 2 '|', 3 '\\'): draw the stroke glyph, the reference's edge-shaped
        // letters that outline every scale
        // (artLetters: the letters themselves, shared by the wyrm and the background props. tone = x
        // brightest letter, y gamma, z value below which a cell prints nothing, w own-pixel share;
        // glyph = x / y set steps, z their dither; lum = x black point, y curve, z dimmest letter)
        vec3 artLetters(vec3 c, vec3 cp, vec2 acell, vec2 local, float stroke, vec4 tone, vec4 glyph, vec3 lum) {
          float v = 1.0 - exp(-max(luma(c) - lum.x, 0.0) * lum.y);
          float h = hash12(acell * 1.37 + 11.0);
          // heat haze: a share of the cells takes the fire's roll for its letter (it re-rolls on the
          // fire's beat), and every letter in the heat slides a pixel sideways in a climbing wave
          float hz = gHaze.x;
          bool boil = hz > 0.0 && hash12(acell * 0.53 + 7.9) < hz * uHazeRoll.x;
          if (boil) h = fract(h + gHaze.y);
          if (hz > 0.0) local.x = clamp(local.x + gHaze.w / uArtCell.x, 0.0, 0.999);
          // the impact ripple (wyrm cells only: gRip is zero elsewhere; the wave itself moved the
          // cell, cellMain): where the front is strong a share of the cells re-rolls its letter
          float rw = gRip.z, rt = gRip.w;
          if (rw > 0.004 && hash12(acell * 0.29 + 4.1) < rw * uRip.x) h = fract(h + 0.37 + floor(rw * 4.0) * 0.21);
          float d = (hash12(acell * 0.71 + 3.7) - 0.5) * glyph.z;
          float s0 = v < glyph.x + d ? 1.0 : v < glyph.y + d ? uWyrmAtlas.x : uWyrmAtlas.y;
          float s1 = v < glyph.x + d ? uWyrmAtlas.x : v < glyph.y + d ? uWyrmAtlas.y : uWyrmAtlas.z;
          float idx = s0 + min(floor(h * (s1 - s0)), s1 - s0 - 1.0);
          if (stroke >= 0.0) idx = uWyrmAtlas.z + stroke;
          if (v < tone.z) idx = 0.0;
          float m = texture2D(tArt, vec2((idx + local.x) / uWyrmAtlas.w, local.y)).a;
          vec3 s = mix(c, cp, tone.w);
          float vp = 1.0 - exp(-max(luma(s) - lum.x, 0.0) * lum.y);
          float mx = max(max(s.r, s.g), s.b);
          vec3 hue = s / max(mx, 1e-4);
          float sat = (mx - min(min(s.r, s.g), s.b)) / max(mx, 1e-4);
          float b = mix(lum.z, tone.x, pow(vp, tone.y));
          vec3 ink = hue * b * mix(1.0, max(1.0, mx), smoothstep(0.25, 0.6, sat));
          if (hz > 0.0) {
            // the letters flicker and take the fire's colour: dark ones are lifted a little (lit by
            // it), bright ones tinted, none of them brighter than a lit rim
            vec3 warm = gHaze.z > 0.5 ? uHazeVoid : vec3(1.0, 0.46, 0.14);
            float fl = boil ? 1.0 + (gHaze.y - 0.5) * 2.0 * uHazeRoll.y : 1.0;
            ink = mix(ink, warm * (luma(ink) * 1.25 + uHazeRoll.z), hz * uHaze.z) * fl;
          }
          // the front lights its letters, the trough behind it darkens them (contrast travels)
          if (rw > 0.004 || rt > 0.004) ink = ink * max(0.0, 1.0 + rw * uRip.y - min(rt, 1.0) * uRip2.x) + vec3(uRip.w * rw);
          return ink * (m * uArtInk);
        }
        // heat haze (uFlame.z > 0 only): the fire field's flame texture has one texel per art cell
        // counted from the screen's lower-left corner. A cell is in the haze when the field is hot at
        // it, in the cells under it (heat climbs) or beside it. Steel (sparks, glints) makes none.
        vec2 flameHeat(vec2 fc) {
          vec4 f = texture2D(tFlame, (clamp(fc, vec2(0.0), uFlameCells - 1.0) + 0.5) / uFlame.xy);
          float kind = floor(f.a * 4.0 + 0.01);
          return vec2(kind < 1.5 ? f.r * 2.5 : 0.0, kind);
        }
        void hazeCell(vec2 cpx, vec2 acell) {
          vec2 fc = floor(cpx / uArtCell);
          vec4 f0 = texture2D(tFlame, (clamp(fc, vec2(0.0), uFlameCells - 1.0) + 0.5) / uFlame.xy);
          float k0 = floor(f0.a * 4.0 + 0.01);
          vec2 best = vec2(k0 < 1.5 ? f0.r * 2.5 : 0.0, k0);
          vec2 t;
          t = flameHeat(fc + vec2(0.0, -2.0)); t.x *= 0.9; if (t.x > best.x) best = t;
          t = flameHeat(fc + vec2(0.0, -5.0)); t.x *= 0.7; if (t.x > best.x) best = t;
          t = flameHeat(fc + vec2(0.0, -9.0)); t.x *= 0.45; if (t.x > best.x) best = t;
          t = flameHeat(fc + vec2(-3.0, -1.0)); t.x *= 0.7; if (t.x > best.x) best = t;
          t = flameHeat(fc + vec2(3.0, -1.0)); t.x *= 0.7; if (t.x > best.x) best = t;
          float hz = smoothstep(uHaze.x, uHaze.y, best.x);
          float wave = sin(acell.y * 1.1 - uTime * 8.0 + acell.x * 0.45);
          gHaze = vec4(hz, f0.b, best.y, hz > 0.0 ? floor(wave * uHaze.w * (0.4 + 0.6 * hz) + 0.5) : 0.0);
        }
        // the impact ripple (uRipN > 0 only) at a boss cell centred at cpx (px), its view depth dz,
        // on a grid of cells cw px wide: each live hit's ring front (a band round the contact, in
        // cells) weighs the cell; cells far nearer or farther than the contact are another thing
        // behind it on screen and take none. Sets gRip (whole px of shove, the strongest weight)
        // A pressure wave: the cell is pushed outward from the contact (and a little along the cut)
        // by the front's Gaussian, so cells bunch ahead of the front and spread behind it and are
        // back at rest past it; a trough (uRip2.x deep, uRip2.y half-widths behind) darkens after
        // the bright front; the first cells round the contact (uRipC.yz) are left alone.
        void rippleCell(vec2 cpx, float dz, float cw) {
          vec2 sh = vec2(0.0), rd0 = vec2(0.0);
          float wm = 0.0, wt = 0.0;
          for (int i = 0; i < ${RIPPLE.slots}; i++) {
            if (float(i) >= uRipN) break;
            vec4 A = uRipA[i];
            vec4 B = uRipB[i];
            vec4 C = uRipC[i];
            vec2 d = cpx - A.xy;
            float rl = length(d);
            float rc = rl / cw;
            float x = (rc - A.z) / B.z;
            float gate = (1.0 - smoothstep(uRip.z, uRip.z * 2.0, abs(dz - B.w)))
              * (C.y > 0.0 ? smoothstep(C.y, C.y + max(C.z, 0.01), rc) : 1.0);
            float g = exp(-x * x) * gate;
            float xt = x + uRip2.y;
            vec2 rd = rl > 0.5 ? d / rl : vec2(0.0);
            sh += (B.xy + rd * C.x) * g;
            float gw = g * A.w;
            if (gw > wm) { wm = gw; rd0 = rd; }
            wt = max(wt, exp(-xt * xt) * gate * A.w * step(0.0, -x));
          }
          // (px are tuned on the wyrm's art cell: a finer grid moves in proportion)
          gRip = vec4(floor(sh * (cw / uArtCell.x) + 0.5), min(wm, 1.5), wt);
          // the front's strongest cells print a stroke lying along it (tangent to the wave)
          gRipS = -1.0;
          if (uRip2.z > 0.0 && wm > 0.45 && hash12(floor(cpx / cw) * 0.61 + 9.3) < uRip2.z * min(wm, 1.0)) {
            vec2 tg = vec2(-rd0.y, rd0.x);
            gRipS = mod(floor(mod(atan(tg.y, tg.x), 3.14159265) / 0.7853982 + 0.5), 4.0);
          }
        }
        vec3 wyrmCell(vec3 c, vec3 cp, vec2 acell, vec2 local, float stroke) {
          return artLetters(c, cp, acell, local, stroke, uWyrmTone, uWyrmGlyph, vec3(uArtBlack.y, uArtLum.y, uArtMin.y));
        }
        // the screen direction (0 '-', 1 '/', 2 '|', 3 '\\') of the edge between the samples of a cell
        // that are in (mask: x BL, y BR, z TL, w TR) and those that are not: marching squares
        float edgeDir(vec4 mask, float hits) {
          if (hits == 2.0 && mask.x == mask.w) return mask.x > 0.5 ? 1.0 : 3.0; // a diagonal pair
          float gx = (mask.y + mask.w) - (mask.x + mask.z);
          float gy = (mask.z + mask.w) - (mask.x + mask.y);
          return mod(floor(mod(atan(gx, -gy), 3.14159265) / 0.7853982 + 0.5), 4.0);
        }

        // ---- the hero as ink-line art (the owner's reference: anime line art turned into ASCII).
        // A cell is one of: an INK LINE (a bright stroke glyph | - / \\ following the edge, in a whitened
        // tint of the part) where the silhouette, a depth step (its nearer side) or a part edge (the
        // higher part, HERO_ART ids in alpha) runs; a GAP (the far side of a depth step: a dark fill);
        // or FILL (dim, dense letters from the density ramp, following the source's light).
        // who the hero branch draws this time: the player on his own grid (gSelf), or a human boss
        bool gSelf;
        vec2 gCell; // the letter cell (px)
        float gLine; // one font pixel (px)
        bool isWho(float a) { return gSelf ? isSelf(a) : (a > 0.46 && a < 0.49); }
        float heroGlyph(float idx, vec2 local) {
          vec2 uv = vec2((idx + local.x) / uHeroCols, local.y);
          return gSelf ? texture2D(tSelfArt, uv).a : texture2D(tHeroArt, uv).a;
        }
        // a neighbouring cell centre: x = its alpha (0 = not the hero), y = its view depth, z = its luma
        vec3 heroAt(vec2 uv) {
          vec4 s = texture2D(tScene, uv);
          return isWho(s.a) ? vec3(s.a, linDepth(uv), luma(s.rgb)) : vec3(0.0, -1.0, 0.0);
        }
        // ... and when that centre is off the hero, whether the cell still draws the outline itself
        // (the midpoint of its two samples nearer this cell hits him, so ≥ 2 of its 4 do): x = -1, and
        // this cell draws none, so the outline stays one letter thick (a double band turned the figure
        // into a wireframe at the game camera, where he is only ~12 letters wide)
        vec3 heroNb(vec2 uv, vec2 toC) {
          vec3 s = heroAt(uv);
          if (s.x <= 0.0 && isWho(texture2D(tScene, uv + toC * 0.25).a)) s.x = -1.0;
          return s;
        }
        // the hero's dark halo over the world (uHeroHalo): 0 .. 1 how much it darkens this off-hero
        // pixel. 8 taps on each of two rings (only inside the circle round his screen position)
        float heroHalo(vec2 px) {
          if (uHeroHalo.w <= 0.0) return 0.0;
          vec2 d = px - uHeroHalo.xy * uRes;
          if (dot(d, d) > uHeroHalo.z * uHeroHalo.z) return 0.0;
          float r1 = uHeroHaloShape.x * uSelfPx, r2 = uHeroHaloShape.y * uSelfPx;
          float n1 = 0.0, n2 = 0.0;
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.7853982;
            vec2 o = vec2(cos(a), sin(a));
            n1 += isHero(texture2D(tScene, (px + o * r1) / uRes).a) ? 1.0 : 0.0;
            n2 += isHero(texture2D(tScene, (px + o * r2) / uRes).a) ? 1.0 : 0.0;
          }
          return uHeroHalo.w * uHeroHaloShape.z * max(step(0.5, n1), 0.55 * step(0.5, n2));
        }
        // ---- the hero seen through what covers him (ADR-106). tSeen holds only the pixels of him
        // that something stands in front of, inside the box round his screen position (outside it
        // the texture is stale: never read)
        bool seenBox(vec2 px) {
          if (uSeen.w < 0.5) return false;
          vec2 d = abs(px - uSeen.xy * uRes);
          return max(d.x, d.y) < uSeen.z;
        }
        // this pixel shows a part of the hero that is covered
        bool seenAt(vec2 px) {
          return seenBox(px) && isHero(texture2D(tSeen, px / uRes).a);
        }
        // the dark gap round his covered figure, over the letters of the wyrm that covers him: 0 .. 1
        // how much it darkens this pixel (heroHalo's two rings, looking for his COVERED pixels; his
        // halo over the world grid and the props finds them in the scene target by itself)
        float seenHalo(vec2 px) {
          if (!seenBox(px)) return 0.0;
          float r1 = uHeroHaloShape.x * uSelfPx, r2 = uHeroHaloShape.y * uSelfPx;
          float n1 = 0.0, n2 = 0.0;
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.7853982;
            vec2 o = vec2(cos(a), sin(a));
            n1 += isHero(texture2D(tSeen, (px + o * r1) / uRes).a) ? 1.0 : 0.0;
            n2 += isHero(texture2D(tSeen, (px + o * r2) / uRes).a) ? 1.0 : 0.0;
          }
          return uSeenTone.w * max(step(0.5, n1), 0.55 * step(0.5, n2));
        }
        // (the player's ids sit HERO_ART.self lower, in his own window)
        float heroA(float a) { return a < 0.455 ? a + ${HERO_ART.self.toFixed(4)} : a; }
        float heroPartOf(float a) { return floor((heroA(a) - ${HERO_ART.a0.toFixed(4)}) / ${(HERO_ART.step * 2).toFixed(4)} + 0.25); }
        float heroIdOf(float a) { return floor((heroA(a) - ${HERO_ART.a0.toFixed(4)}) / ${HERO_ART.step.toFixed(4)} + 0.5); }
        // The ink LINES are found per PIXEL, so they follow every curve exactly (a line per cell, centred
        // in it, stair-stepped every diagonal and curve). Neighbour pixel n (alpha aN, view depth dN; dN
        // < 0: off the hero) seen from this hero pixel (aP, dP); dO = the opposite neighbour's depth
        // (a slope predictor: curved and grazing surfaces draw no line, only real steps do). Returns
        // the line this pixel draws: 1 silhouette, 0.8 a depth step (n lies behind), 0.6 a part edge
        // (n is a lower part: the higher part draws), 0.4 a piece edge inside one part (only where
        // fine), 0 none. Each edge is drawn once, one pixel wide, on one side.
        float heroPxEdge(float aN, float dN, float aP, float dP, float dO, float th, bool fine) {
          if (dN < 0.0) return 1.0;
          float pred = dO > 0.0 && abs(dP - dO) < th * 4.0 ? 2.0 * dP - dO : dP;
          float d = dN - pred;
          if (d > th) return 0.8;
          if (d < -th) return 0.0;
          float pp = heroPartOf(aP), pn = heroPartOf(aN);
          if (pn < pp - 0.5) return 0.6;
          if (fine && abs(pn - pp) < 0.5 && heroIdOf(aN) < heroIdOf(aP) - 0.5) return 0.4;
          return 0.0;
        }
        // neighbour n seen from this cell (depth dC, part alpha aC, luma lC); the opposite neighbour's
        // depth dO predicts a smooth slope, so curved and grazing surfaces draw no line, only real
        // steps and sharp creases do. x = the ink line this cell draws: 1 silhouette (n is
        // background; none if n draws it itself, x = -1, see heroNb), 0.8 a depth step (n lies
        // behind), 0.6 a part edge (n is a lower part at the same depth), 0.5 a crease in the light
        // (fold, terminator, glint: this cell is the lit side) and 0.4 a piece edge inside one part
        // (both only where near: up close, see uHeroLod), 0 none; y = 1: n steps in front (this cell
        // is the far side of a step: a gap)
        vec2 heroEdge(vec3 n, float dC, float aC, float lC, float dO, float th, bool near) {
          if (n.x <= 0.0) return vec2(n.x < 0.0 ? 0.0 : 1.0, 0.0);
          float pred = dO > 0.0 && abs(dC - dO) < th * 4.0 ? 2.0 * dC - dO : dC;
          float d = n.y - pred;
          if (d > th) return vec2(0.8, 0.0);
          if (d < -th) return vec2(0.0, 1.0);
          if (n.x >= aC - ${(HERO_ART.step * 0.5).toFixed(5)}) {
            return vec2(near && n.x < aC + ${(HERO_ART.step * 0.5).toFixed(5)} && lC > n.z * uHeroCrease.x + uHeroCrease.y ? 0.5 : 0.0, 0.0);
          }
          float pc = heroPartOf(aC), pn = heroPartOf(n.x);
          return vec2(pc != pn ? 0.6 : near ? 0.4 : 0.0, 0.0);
        }

        // One fighter of the hero-art pass at this pixel: the player (gSelf) or a human boss, on
        // the grid gCell. True when it drew the pixel.
        bool heroArtCell(vec2 px) {
          bool drew = false;
          vec2 hcell = floor(px / gCell);
          vec2 hbase = hcell * gCell;
          vec3 hsum = vec3(0.0);
          float hhits = 0.0, dN = 1e9, aN = 0.0;
          vec4 hin = vec4(0.0); // which of the 4 samples hit the hero (the in-cell silhouette direction)
          for (int i = 0; i < 4; i++) {
            vec2 o = vec2(i == 1 || i == 3 ? 0.75 : 0.25, i >= 2 ? 0.75 : 0.25);
            vec2 suv = (hbase + o * gCell) / uRes;
            vec4 sa = texture2D(tScene, suv);
            if (isWho(sa.a)) {
              hsum += sa.rgb;
              hhits += 1.0;
              hin[i] = 1.0;
              float dz = linDepth(suv);
              if (dz < dN) { dN = dz; aN = sa.a; }
            }
          }
          vec2 cuvH = (hbase + 0.5 * gCell) / uRes;
          vec4 cH = texture2D(tScene, cuvH);
          bool cHero = isWho(cH.a);
          // (his ink lines are found per FONT pixel, gLine screen px: on a large screen they keep the
          // letters' own blocky step instead of turning into a hairline round big letters)
          vec2 uvP = gSelf ? (floor(px / gLine) + 0.5) * gLine / uRes : px / uRes;
          vec4 sP = texture2D(tScene, uvP);
          bool pHero = isWho(sP.a); // this pixel itself shows the hero (its ink line is found here)
          bool hCell = cHero || hhits >= 2.0; // the cell prints one of his fill letters
          if (hCell || pHero) {
            vec2 local = (px - hbase) / gCell;
            float dP = pHero ? linDepth(uvP) : dN;
            // distance LOD (view depth): 0 up close, 1 at the game camera. Far away nearly every cell
            // of a 12-letter-wide figure sits on some edge, so the fine inner lines (piece edges) drop
            // out, dithered per cell so there is no pop, and the cloth lines turn into dark seams: the
            // figure reads as a dark letter mass with a crisp rim and bright armour, not a wireframe.
            float far = smoothstep(uHeroLod.x, uHeroLod.y, dP);
            bool fine = hash12(hcell * 0.73 + 5.1) >= smoothstep(0.0, 0.6, far);
            // ---- the cell: a fill letter from its part, light and edges
            vec3 col = vec3(0.0);
            float lineC = 0.0;
            float inkP = 0.0; // the ink line this pixel draws: 1 his silhouette, 0.6 an inner line, 0 none
            if (hCell) {
              // the cell's part = its centre (else its nearest hero sample)
              float dC = cHero ? linDepth(cuvH) : dN;
              float aC = cHero ? cH.a : aN;
              vec3 c = (hsum + (cHero ? cH.rgb : vec3(0.0))) / (hhits + (cHero ? 1.0 : 0.0));
              float th = max(uArtEdge.x, 1e-4) * dC;
              vec2 dx = vec2(gCell.x, 0.0) / uRes, dy = vec2(0.0, gCell.y) / uRes;
              vec3 sL = heroNb(cuvH - dx, dx), sR = heroNb(cuvH + dx, -dx), sD = heroNb(cuvH - dy, dy), sU = heroNb(cuvH + dy, -dy);
              float lC = luma(c);
              vec2 eL = heroEdge(sL, dC, aC, lC, sR.y, th, fine), eR = heroEdge(sR, dC, aC, lC, sL.y, th, fine);
              vec2 eD = heroEdge(sD, dC, aC, lC, sU.y, th, fine), eU = heroEdge(sU, dC, aC, lC, sD.y, th, fine);
              float sil = hhits < 4.0 ? 1.0 : 0.0; // the silhouette runs through this cell
              lineC = max(sil, max(max(eL.x, eR.x), max(eD.x, eU.x)));
              float gap = max(max(eL.y, eR.y), max(eD.y, eU.y)) * step(lineC, 0.1);
              float mx = max(max(c.r, c.g), c.b);
              vec3 hue = c / max(mx, 1e-4);
              float sat = (mx - min(min(c.r, c.g), c.b)) / max(mx, 1e-4);
              float v = 1.0 - exp(-max(luma(c) - uArtBlack.x, 0.0) * uArtLum.x);
              // the blade / gem keep their glow (capped far away: uHeroFar.w)
              float hdr = mix(1.0, clamp(mx, 1.0, mix(64.0, uHeroFar.w, far)), smoothstep(0.25, 0.6, sat));
              int pid = int(clamp(heroPartOf(aC), 0.0, ${(HERO_PARTS - 1).toFixed(1)}));
              vec4 pf = gSelf ? uSelfPartFill[pid] : uHeroPartFill[pid];
              if (uHeroDebug > 0.5 && uHeroDebug < 1.5) {
                col = c; // look-dev: the raw art source
              } else if (uHeroDebug < 1.5) {
                float jit = (hash12(hcell * 1.37 + 11.0) - 0.5) * mix(uArtDither.x, uHeroFar.z, far);
                vec2 ramp = mix(uHeroFill.zw, uHeroFar.xy, far);
                float idx = clamp(floor(mix(ramp.x, ramp.y, v) * (uHeroCount - 1.0) + 0.5 + jit), 1.0, uHeroCount - 1.0);
                // the impact ripple (a boss only: gRip is zero for the player): a share of the cells
                // the front crosses re-rolls to a neighbour on his density ramp
                if (!gSelf && gRip.z > 0.004 && hash12(hcell * 0.29 + 4.1) < gRip.z * uRip.x)
                  idx = clamp(idx + (hash12(hcell + floor(gRip.z * 4.0)) < 0.5 ? -2.0 : 2.0), 1.0, uHeroCount - 1.0);
                // ... and the wave's front prints denser marks, its trough sparser ones
                if (!gSelf && uRip2.x > 0.0) idx = clamp(idx + floor(4.0 * min(gRip.z, 1.0) - 4.0 * min(gRip.w, 1.0) + 0.5), 1.0, uHeroCount - 1.0);
                // up close a cell an edge runs through prints a dim letter, so the ink line sits in a
                // dark channel (the reference's line art); far away it keeps its letter. An 'open'
                // part (pf.y >= 4: the face) keeps its letters lit up to its edges
                float open = step(3.5, mod(pf.y, 8.0));
                float chan = lineC > 0.1 ? mix(mix(uHeroPx.z, 1.0, far), 1.0, open) : 1.0;
                gap *= 1.0 - open;
                // the mark's colour: the part's hue, a little greyer (the reference's cloth is
                // charcoal with a hint of its tint), brightness LINEAR in the light value
                vec3 tone = mix(vec3(dot(hue, vec3(0.3333))), hue, mix(0.8, 1.0, smoothstep(0.25, 0.6, sat)));
                col = tone * mix(uHeroFill.x, uHeroFill.y, v) * pf.x * hdr * mix(1.0, uHeroInk.w, gap) * mix(1.0, uHeroLod.z * pf.w, far) * chan * heroGlyph(idx, local);
              }
            }
            // ---- this pixel's ink line: exact, one pixel wide, following every curve; drawn as one
            // stroke per letter cell (a gap where the stroke crosses the cell's letter spacing), so a
            // contour reads as a chain of stroke glyphs, not a vector line
            if (pHero && uHeroDebug < 0.5 || pHero && uHeroDebug > 1.5) {
              vec2 o = gLine / uRes;
              vec2 uL = uvP - vec2(o.x, 0.0), uR = uvP + vec2(o.x, 0.0), uD = uvP - vec2(0.0, o.y), uU = uvP + vec2(0.0, o.y);
              float aL = texture2D(tScene, uL).a, aR = texture2D(tScene, uR).a, aD = texture2D(tScene, uD).a, aU = texture2D(tScene, uU).a;
              float dL = isWho(aL) ? linDepth(uL) : -1.0, dR = isWho(aR) ? linDepth(uR) : -1.0;
              float dD = isWho(aD) ? linDepth(uD) : -1.0, dU = isWho(aU) ? linDepth(uU) : -1.0;
              float thP = max(uHeroPx.y, 1e-5) * dP;
              float eL = heroPxEdge(aL, dL, sP.a, dP, dR, thP, fine), eR = heroPxEdge(aR, dR, sP.a, dP, dL, thP, fine);
              float eD = heroPxEdge(aD, dD, sP.a, dP, dU, thP, fine), eU = heroPxEdge(aU, dU, sP.a, dP, dD, thP, fine);
              float pl = max(max(eL, eR), max(eD, eU));
              float soft = 1.0;
              if (pl < 0.1 && far < 0.5 && uHeroPx.w > 0.0) {
                // up close a line is two pixels: the core above, and a dimmer pixel beside it (the
                // reference's ink is ~2 px with an anti-aliased edge); none far away (crisp 1 px)
                vec2 o2 = o * 2.0;
                vec2 vL = uvP - vec2(o2.x, 0.0), vR = uvP + vec2(o2.x, 0.0), vD = uvP - vec2(0.0, o2.y), vU = uvP + vec2(0.0, o2.y);
                float bL = texture2D(tScene, vL).a, bR = texture2D(tScene, vR).a, bD = texture2D(tScene, vD).a, bU = texture2D(tScene, vU).a;
                float gL = isWho(bL) ? linDepth(vL) : -1.0, gR = isWho(bR) ? linDepth(vR) : -1.0;
                float gD = isWho(bD) ? linDepth(vD) : -1.0, gU = isWho(bU) ? linDepth(vU) : -1.0;
                float th2 = thP * 2.0;
                eL = heroPxEdge(bL, gL, sP.a, dP, gR, th2, fine); eR = heroPxEdge(bR, gR, sP.a, dP, gL, th2, fine);
                eD = heroPxEdge(bD, gD, sP.a, dP, gU, th2, fine); eU = heroPxEdge(bU, gU, sP.a, dP, gD, th2, fine);
                pl = max(max(eL, eR), max(eD, eU));
                soft = uHeroPx.w;
              }
              if (pl > 0.1) {
                // the side the other part lies on: the line runs across it
                vec2 pg = vec2(step(0.1, eR) - step(0.1, eL), step(0.1, eU) - step(0.1, eD));
                bool vRun = abs(pg.x) > abs(pg.y), hRun = abs(pg.y) > abs(pg.x);
                int pidP = int(clamp(heroPartOf(sP.a), 0.0, ${(HERO_PARTS - 1).toFixed(1)}));
                vec4 pInk = gSelf ? uSelfPartInk[pidP] : uHeroPartInk[pidP];
                vec4 pfP = gSelf ? uSelfPartFill[pidP] : uHeroPartFill[pidP];
                // stroke style (pfP.y): 0 one stroke per cell (a 1-px gap at the letter spacing),
                // 1 dotted (a short dash per cell: the torn tails' and the hair's specks), 2 unbroken
                // (far away the strokes join up: a crisp, unbroken silhouette at the game camera)
                bool outer = pl > 0.9;
                vec4 pRim = gSelf ? uSelfPartRim[pidP] : uHeroPartRim[pidP];
                float on = 1.0, style = outer && pfP.y > 7.5 ? 1.0 : mod(pfP.y, 4.0);
                if (style > 1.5) on = 1.0;
                else if (style > 0.5) on = vRun ? step(abs(local.y - 0.5), 0.2) : hRun ? step(abs(local.x - 0.5), 0.2) : 1.0;
                else if (far < 0.5) on = vRun ? step(0.1667, local.y) : hRun ? step(local.x, 0.75) : 1.0;
                vec3 s = sP.rgb;
                float mxP = max(max(s.r, s.g), s.b);
                vec3 hueP = s / max(mxP, 1e-4);
                float satP = (mxP - min(min(s.r, s.g), s.b)) / max(mxP, 1e-4);
                float vP = 1.0 - exp(-max(luma(s) - uArtBlack.x, 0.0) * uArtLum.x);
                float hdrP = mix(1.0, clamp(mxP, 1.0, mix(64.0, uHeroFar.w, far)), smoothstep(0.25, 0.6, satP));
                float k = outer ? 1.0 : pl > 0.7 ? uHeroLine.x : pl > 0.5 ? uHeroLine.y : uHeroLine.z;
                // far away: inner lines keep pfP.z of their light (cloth: dark seams; armour, blade:
                // bright), silhouettes keep at least uHeroLod.w (a dim cool rim round the dark cloth;
                // the armour's and the glowing parts' stay bright)
                k *= outer ? mix(1.0, max(uHeroLod.w, pfP.z), far * step(pInk.a, 1.5)) : mix(1.0, pfP.z, far);
                vec3 ink = mix(vec3(1.0), hueP, uHeroInk.z * (0.35 + 0.65 * satP)) * pInk.rgb;
                vec3 lc = ink * mix(uHeroInk.x, uHeroInk.y, vP) * k * pInk.a * hdrP * soft;
                // the silhouette takes the part's own rim ink (cloth: dim blue-lavender; armour: white)
                if (outer) lc = pRim.rgb * (mix(uHeroInk.x, uHeroInk.y, vP) * k * pRim.a * hdrP * soft);
                if (uHeroDebug > 2.5) lc = 0.5 * (outer ? vec3(1.0) : pl > 0.7 ? vec3(1.0, 0.08, 0.05) : pl > 0.5 ? vec3(0.1, 1.0, 0.15) : vec3(1.0, 0.85, 0.05));
                if (on > 0.5) { col = lc; inkP = outer ? 1.0 : 0.6; }
                else if (uHeroDebug > 1.5) col = vec3(0.0);
              } else if (uHeroDebug > 1.5) col = vec3(0.0);
            }
            // where something covers him (ADR-106) the same art prints through it in the blade's cyan:
            // a bright silhouette, his inner lines and fill letters at their own brightness
            if (seenAt(px) || seenAt(hbase + 0.5 * gCell)) {
              float l = max(col.r, max(col.g, col.b));
              col = uSeenInk * (inkP > 0.9 ? uSeenTone.x : min(l * (inkP > 0.1 ? uSeenTone.y : uSeenTone.z), 1.3));
            }
            // the ripple's front lifts a boss's lit pixels a little (none where his cell is blank)
            if (!gSelf && (gRip.z > 0.004 || gRip.w > 0.004))
              col = col * max(0.0, 1.0 + gRip.z * uRip.y - min(gRip.w, 1.0) * uRip2.x) + vec3(uRip.w * gRip.z) * step(1e-4, max(col.r, max(col.g, col.b)));
            gl_FragColor = vec4(col, 1.0);
            drew = true;
          }
          return drew;
        }

        // ---- the time rip (timeRip.js): is this pixel's art cell in a live cut's band? Measured in
        // cells (5 x 8) from the cell's centre to the cut's segment; a strip moves what the band
        // prints by whole cells along the cut, each side the other way (the cells ON the line stay:
        // the seam is the fire field's steel); a negative marks the band.
        void cutBand(vec2 px) {
          vec2 c = floor(px / uArtCell) + 0.5;
          for (int i = 0; i < ${CUT_SLOTS}; i++) {
            if (float(i) >= uCutN) break;
            vec4 A = uCutA[i];
            vec4 B = uCutB[i];
            vec2 a = A.xy / uArtCell, ab = A.zw / uArtCell - a;
            float L2 = dot(ab, ab);
            if (L2 < 0.25) continue;
            float t = dot(c - a, ab) / L2;
            if (t < 0.0 || t > 1.0) continue;
            float L = sqrt(L2);
            vec2 dir = ab / L;
            float s = dot(c - a, vec2(-dir.y, dir.x));
            if (abs(s) > B.y) continue;
            if (B.x < 1.5) {
              if (abs(s) < 0.5) continue;
              gCutPx = px - floor(dir * B.z * sign(s) + 0.5) * uArtCell;
            } else gCutNeg = max(gCutNeg, B.w);
          }
        }

        void cellMain() {
          vec2 px = gCutPx;
          // the hero first: his own pixel-font grid, drawn as ink-line art. The player on the grid
          // that follows his size (only the box round him is searched), then the human bosses on theirs
          vec2 dS = abs(px - uSelfBox.xy);
          gSelf = true; gCell = uSelfCell; gLine = uSelfPx;
          if ((uSelfBox.w < 0.5 || max(dS.x, dS.y) < uSelfBox.z) && heroArtCell(px)) return;
          gSelf = false; gCell = uHeroCell; gLine = uHeroPx.x;
          // the impact ripple on a human boss (his ink-line art): his cell near the ring front is
          // drawn from the pixels a shove away, so his letters AND his ink lines move with it
          vec2 pxB = px;
          if (uRipN > 0.5) {
            vec2 hc0 = (floor(px / gCell) + 0.5) * gCell;
            rippleCell(hc0, linDepth(hc0 / uRes), gCell.x);
            pxB = px - gRip.xy;
          }
          if (heroArtCell(pxB)) return;
          gRip = vec4(0.0); gRipS = -1.0; // (the wyrm's cells weigh their own)
          // the impact ripple on the wyrm: the same, on its art grid (whole letters slide a pixel or
          // two along the cut; pa is where this pixel reads the wyrm's grid from)
          vec2 pa = px;
          if (uRipN > 0.5) {
            vec2 ac0 = (floor((px - uWyrmAnchor) / uArtCell) + 0.5) * uArtCell + uWyrmAnchor;
            rippleCell(ac0, linDepth(ac0 / uRes), uArtCell.x);
            pa = px - gRip.xy;
          }
          // the wyrm (other creatures): the art grid, anchored to the wyrm's screen position
          vec2 acell = floor((pa - uWyrmAnchor) / uArtCell);
          vec2 abase = acell * uArtCell + uWyrmAnchor;
          vec3 asum = vec3(0.0);
          float ahits = 0.0, dmin = 1e9, dmax = 0.0;
          vec4 votes = vec4(0.0); // wyrm stroke codes (alpha 0.51 .. 0.54, materials.js wyrmMain)
          vec3 arim = vec3(0.0); // brightest stroke-coded sample: a stroke glyph's colour
          vec4 amask = vec4(0.0); // which samples hit the wyrm: x BL, y BR, z TL, w TR
          for (int i = 0; i < 4; i++) {
            vec2 o = vec2(i == 1 || i == 3 ? 0.75 : 0.25, i >= 2 ? 0.75 : 0.25);
            vec2 suv = (abase + o * uArtCell) / uRes;
            vec4 sa = texture2D(tScene, suv);
            if (isArt(sa.a) && !isHero(sa.a)) {
              if (i == 0) amask.x = 1.0; else if (i == 1) amask.y = 1.0; else if (i == 2) amask.z = 1.0; else amask.w = 1.0;
              asum += sa.rgb;
              ahits += 1.0;
              float dz = linDepth(suv);
              dmin = min(dmin, dz);
              dmax = max(dmax, dz);
              float code = floor((sa.a - 0.5) * 100.0 + 0.5);
              votes += vec4(equal(vec4(code), vec4(1.0, 2.0, 3.0, 4.0)));
              if (code > 0.5 && luma(sa.rgb) > luma(arim)) arim = sa.rgb;
            }
          }
          // silhouette cells (1-3 of the 4 samples on the wyrm) draw their edge as a stroke glyph along
          // it (marching squares on the samples): the reference's character-drawn outlines, so spikes,
          // claws and torn wing edges keep their shape instead of dissolving into letters
          float edgeS = -1.0;
          if (uWyrmOutline > 0.5 && ahits >= 1.0 && ahits <= 3.0) {
            if (ahits == 2.0 && amask.x == amask.w) edgeS = amask.x > 0.5 ? 1.0 : 3.0; // diagonal pair
            else {
              float gx = (amask.y + amask.w) - (amask.x + amask.z);
              float gy = (amask.z + amask.w) - (amask.x + amask.y);
              edgeS = mod(floor(mod(atan(gx, -gy), 3.14159265) / 0.7853982 + 0.5), 4.0);
            }
            // a horizontal edge prints a letter, not '-': long dash runs along the wing tops, the
            // tail and the toes read as ruled lines, not as the reference's lettered outlines
            if (edgeS == 0.0) edgeS = -1.0;
          }
          // a cell needs 2 of 4 samples on the wyrm, or 1 when it draws a stroke (an outline, or a
          // stroke-coded spike / claw / horn tip that would otherwise vanish between the samples)
          float strokeHits = max(max(votes.x, votes.y), max(votes.z, votes.w));
          if (ahits >= 2.0 || (ahits >= 1.0 && (strokeHits >= 1.0 || edgeS >= 0.0))) {
            // letting go: the cell's letter has left it (main draws it falling); its body stays black
            // until the material lets the cell go
            if (uWyrmLetGo.x > 0.0 && uWyrmLetGo.x >= letGoAt(acell)) {
              gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
              return;
            }
            if (uArtEdge.y > 0.0 && (dmax - dmin) > uArtEdge.y * dmin) {
              gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
              return;
            }
            vec4 sp = texture2D(tScene, pa / uRes);
            vec3 cp = isArt(sp.a) && !isHero(sp.a) ? sp.rgb : asum / ahits;
            float best = max(max(votes.x, votes.y), max(votes.z, votes.w));
            float stroke = best < uWyrmGlyph.w ? -1.0 : votes.x == best ? 0.0 : votes.y == best ? 1.0 : votes.z == best ? 2.0 : 3.0;
            vec3 ca = asum / ahits;
            if (uWyrmTaps > 0.5) {
              // the cell's tone: a 4x4 average of the source over the cell (on top of the 4 taps)
              vec3 s2 = asum;
              float n2 = ahits;
              for (int j = 0; j < 16; j++) {
                vec2 o2 = (vec2(mod(float(j), 4.0), floor(float(j) / 4.0)) + 0.5) * 0.25;
                vec4 sb = texture2D(tScene, (abase + o2 * uArtCell) / uRes);
                if (isArt(sb.a) && !isHero(sb.a)) { s2 += sb.rgb; n2 += 1.0; }
              }
              ca = s2 / n2;
              if (!(isArt(sp.a) && !isHero(sp.a))) cp = ca;
            }
            if (stroke >= 0.0) { ca = arim; cp = arim; } // an outline glyph is drawn whole in the rim's colour
            if (edgeS >= 0.0) { stroke = edgeS; ca = max(asum / ahits, arim); cp = ca; }
            // the ripple's front: a share of its cells print a stroke lying along it (the house
            // style's outline strokes), for the frame or two the front is on them
            if (gRipS >= 0.0 && stroke < 0.0) stroke = gRipS;
            if (uFlame.z > 0.5) hazeCell(abase + 0.5 * uArtCell, acell);
            // (a thin dark gap round the hero where this cell covers him: his cyan figure stays apart
            // from the wyrm's letters, also over its glow)
            gl_FragColor = vec4(wyrmCell(ca, cp, acell, (pa - abase) / uArtCell, stroke) * (1.0 - seenHalo(px)), 1.0);
            return;
          }
          gRip = vec4(0.0); // (the props never take it)
          if (isArt(texture2D(tScene, px / uRes).a)) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // creature edge sliver: black, like the images
            return;
          }
          // ---- background props (FLAG.ART_PROP): the wyrm's letters, on the grid counted from the
          // ground. The silhouette prints stroke glyphs along itself, a depth step inside the object
          // (a cap over a shaft, an arm over a robe) a dimmer one: the object is outlined in characters.
          vec2 pcell = floor((px - uPropAnchor) / uArtCell);
          vec2 pbase = pcell * uArtCell + uPropAnchor;
          vec3 psum = vec3(0.0);
          float phits = 0.0;
          vec4 pmask = vec4(0.0), pdep = vec4(0.0);
          // (the dragon print: its samples' ink and tone, and how many of them are its own)
          vec4 pdps = vec4(0.0);
          float pdp = 0.0, pleaf = 0.0;
          bool dpOn = uDpOn.x + uDpOn.y > 0.5;
          for (int i = 0; i < 4; i++) {
            vec2 o = vec2(i == 1 || i == 3 ? 0.75 : 0.25, i >= 2 ? 0.75 : 0.25);
            vec2 suv = (pbase + o * uArtCell) / uRes;
            vec4 sa = texture2D(tScene, suv);
            float pk = propKind(sa.a);
            if (pk > 0.0) {
              float dz = linDepth(suv);
              if (i == 0) { pmask.x = 1.0; pdep.x = dz; } else if (i == 1) { pmask.y = 1.0; pdep.y = dz; } else if (i == 2) { pmask.z = 1.0; pdep.z = dz; } else { pmask.w = 1.0; pdep.w = dz; }
              psum += sa.rgb;
              phits += 1.0;
              if (dpOn) {
                pdps += dpSample(sa);
                if (pk > 1.5) pdp += 1.0;
                if (dpLeafA(sa.a)) pleaf += 1.0;
              }
            }
          }
          if (phits >= 1.0) {
            float pstroke = -1.0, pgain = 1.0;
            if (phits <= 3.0) {
              pstroke = edgeDir(pmask, phits);
              pgain = uPropOutline.x;
            } else if (uPropOutline.y > 0.0) {
              float dmin = min(min(pdep.x, pdep.y), min(pdep.z, pdep.w));
              float dmax = max(max(pdep.x, pdep.y), max(pdep.z, pdep.w));
              // (the dragon print draws an inner stroke only at a bigger step: a crown's clumps are not outlined)
              if (dmax - dmin > (pdp > 0.0 ? uDpBack.z : uPropOutline.y) * dmin) {
                vec4 nearM = step(pdep, vec4(0.5 * (dmin + dmax)));
                float nh = nearM.x + nearM.y + nearM.z + nearM.w;
                if (nh >= 1.0 && nh <= 3.0) { pstroke = edgeDir(nearM, nh); pgain = uPropOutline.z; }
              }
            }
            // (a crown of leaves has no outline: its edge is the ragged edge of its digits)
            if (pdp > 0.0 && pleaf * 2.0 > phits) pstroke = -1.0;
            if (phits >= 2.0 || pstroke >= 0.0) {
              if (pdp > 0.0) {
                // THE DRAGON PRINT (render/dragonProps.js): the ground's digit for the cell's tone, in its ink
                if (uFlame.z > 0.5) hazeCell(pbase + 0.5 * uArtCell, pcell);
                float sg = phits <= 3.0 ? uDpArtInk.x : uDpArtInk.y;
                vec3 dc = dpPropCell(pdps.rgb / phits, pdps.a / phits, pcell, (px - pbase) / uArtCell, pstroke, sg);
                gl_FragColor = vec4(dc * (1.0 - heroHalo(px)), 1.0);
                return;
              }
              // (the four samples that found the cell are its tone: a prop's source is smooth, facet by
              // facet, so the wyrm's 16 extra taps would cost a quarter of the pass for nothing)
              vec3 ca = psum / phits * pgain;
              vec4 sp = texture2D(tScene, px / uRes);
              vec3 cp = isProp(sp.a) && pstroke < 0.0 ? sp.rgb : ca;
              if (uFlame.z > 0.5) hazeCell(pbase + 0.5 * uArtCell, pcell);
              vec3 pc = artLetters(ca, cp, pcell, (px - pbase) / uArtCell, pstroke, uPropTone, uPropGlyph, uPropLum);
              gl_FragColor = vec4(pc * (1.0 - heroHalo(px)), 1.0);
              return;
            }
          }
          if (propKind(texture2D(tScene, px / uRes).a) > 0.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // an object's edge sliver: black
            return;
          }
          vec2 cell = floor(px / uCell);
          vec2 cuv = (cell + 0.5) * uCell / uRes;
          vec4 c = texture2D(tScene, cuv);
          vec2 local = (px - cell * uCell) / uCell;
          float a = c.a;
          vec3 col;
          if (a < 0.03) {
            col = texture2D(tScene, px / uRes).rgb; // untagged: pass through
          } else if (isArt(a) || isProp(a) || (uDpOn.y > 0.5 && a > 0.588)) {
            // world cell centred on a creature / prop edge (under ?dpTrees a tree's too: the trees are props
            // then, render/dragonProps.js): raw pixel. (Checked BEFORE the creature
            // grid: the player's own window (isSelf, 0.42 - 0.45) lies under 0.46, so a world cell whose
            // centre fell on his blade printed a creature-grid letter in the steel's raw HDR colour (4 - 6)
            // beside it: a bright letter that bloomed round a resting blade. ADR-183)
            col = texture2D(tScene, px / uRes).rgb;
          } else if (a < 0.46) {
            col = creatureCell(c, cell, local);
          } else if (a < 0.8) {
            float l = 1.0 - exp(-luma(c.rgb) * uLumMap);
            float level = clamp(floor(l * 14.0), 0.0, 13.0);
            float m = glyphAt(1.0, level * 4.0 + floor(hash12(cell) * 4.0), local);
            col = mix(c.rgb * uBg, c.rgb * uGain * 0.78, m); // foliage a touch softer than stone
          } else {
            col = stoneCell(c, cell, local);
          }
          gl_FragColor = vec4(col * (1.0 - heroHalo(px)), 1.0);
        }

        // ---- letting go (letGo.js; only while the wyrm dissolves): the letter of a cell that has
        // let go falls down the screen, accelerating, turning to ember and fading. A pixel finds the
        // falling letter that covers it among the cells straight above (LG_FALL of them at most);
        // the letter is printed from its cell's source, which the material keeps until it has fallen.
        void letGoFall() {
          gHaze = vec4(0.0);
          vec2 g = (gl_FragCoord.xy - uWyrmGrid.zw) / uWyrmGrid.xy;
          vec2 c0 = floor(g);
          // outside the body's box (and the fall below it): nothing can be falling here
          if (abs(c0.x) > uWyrmLetGo.w || c0.y > uWyrmLetGo.y + 1.0 || c0.y < uWyrmLetGo.y - uWyrmLetGo.z - LG_FALL - 1.0) return;
          for (int k = 0; k <= int(LG_FALL); k++) {
            vec2 s = c0 + vec2(0.0, float(k));
            float t = (uWyrmLetGo.x - letGoAt(s)) / LG_WINDOW;
            if (t <= 0.0 || t >= 1.0) continue;
            float ly = g.y - s.y + LG_FALL * t * t;
            if (ly < 0.0 || ly >= 1.0) continue;
            vec2 suv = ((s + 0.5) * uWyrmGrid.xy + uWyrmGrid.zw) / uRes;
            vec4 sc = texture2D(tScene, suv);
            if (!isArt(sc.a) || isHero(sc.a)) continue;
            // it falls at its own depth: whatever stands nearer (the hero, a stone) covers it
            if (linDepth(suv) > linDepth(gl_FragCoord.xy / uRes) + 1.5) continue;
            vec3 ember = vec3(1.0, 0.36, 0.08) * uLetGoInk.w;
            // its own colour, lifted so a charcoal letter reads, burning to ember as it falls
            vec3 src = max(sc.rgb, vec3(uLetGoInk.y * 0.2)) + ember * (0.05 + 0.25 * t);
            vec3 ink = artLetters(src, src, s, vec2(fract(g.x), ly), -1.0, uWyrmTone, uWyrmGlyph, vec3(uArtBlack.y, uArtLum.y, max(uArtMin.y, uLetGoInk.y)));
            float a = 1.0 - t * t * t;
            bool body = isArt(texture2D(tScene, gl_FragCoord.xy / uRes).a);
            gl_FragColor.rgb = gl_FragColor.rgb * (1.0 - (body ? uLetGoInk.z : 0.0) * a) + ink * a;
            return;
          }
        }

        void main() {
          gCutPx = gl_FragCoord.xy;
          if (uCutN > 0.5) cutBand(gCutPx);
          cellMain();
          if (uWyrmLetGo.x > 0.0) letGoFall();
          // the time rip's negative (the band only): the letter that was printed here, inverted. A
          // pixel of a letter's stroke is brighter than the cell's background (black on a figure, the
          // scene's colour x uBg on the floor): above that x uCutTone.w it is a stroke and prints
          // dark, everything else in the cell prints the pale steel. The glyph's mask, not a fill.
          if (gCutNeg > 0.0) {
            vec3 col = gl_FragColor.rgb;
            float bg = luma(texture2D(tScene, gl_FragCoord.xy / uRes).rgb) * uBg * uCutTone.w;
            float lit = step(max(0.004, bg), luma(col));
            vec3 neg = mix(uCutTone.rgb, uCutTone.rgb * 0.05, lit);
            gl_FragColor.rgb = mix(col, neg, clamp(gCutNeg, 0.0, 1.0));
          }
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    {
      // the wyrm's (.y) art-pass numbers, read by wyrmCell: its source (materials.js wyrmMain) is a
      // dark hide with bright scale rims, so a steep curve + low floor keeps most letters charcoal
      const u = this.asciiMat.uniforms;
      // (ADR-093: the calm values again; ADR-092's 4.5 / 0.1 lit the whole body bright)
      u.uArtLum.value.y = 2.2;
      u.uArtBlack.value.y = 0.004;
      u.uArtMin.value.y = 0.012;
    }

    // --- the seen-through probe (ADR-106): a quad over the hero's torso rect, at the depth of his
    // centre line pulled towards the camera (uProbe: screen y of the slab's foot / top in px, the
    // view depth in m to test there). It passes where the scene is nearer: something may cover
    // him. It writes nothing; _seenProbe counts its samples with an occlusion query.
    this.seenProbeMat = new THREE.ShaderMaterial({
      uniforms: {
        uProbe: { value: new THREE.Vector4(0, 1, 1, 1) },
        uNear: { value: 1 },
        uFar: { value: 200 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform vec4 uProbe;
        uniform float uNear;
        uniform float uFar;
        void main() {
          float t = clamp((gl_FragCoord.y - uProbe.x) / max(uProbe.y - uProbe.x, 1.0), 0.0, 1.0);
          float lin = max(mix(uProbe.z, uProbe.w, t), uNear);
          gl_FragDepth = clamp(0.5 * (uFar + uNear - 2.0 * uNear * uFar / lin) / (uFar - uNear) + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(0.0);
        }
      `,
      depthTest: true,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      colorWrite: false,
      blending: THREE.NoBlending,
    });
    // --- the seen-through quads (ADR-106), drawn over the box round the hero only (_renderSeen)
    // 1. into seenRT, which holds the hero drawn alone: erase every pixel of him the scene shows.
    // The quad's depth is the scene's, pushed back by a margin, and it passes (erases) where that is
    // not in front of the hero's own depth. So a pixel of him stays only where something stands at
    // least the margin in front of him: uMargin.x m for tagged things (the wyrm, props, trees),
    // .y m for untagged ones (alpha 0: the grass at his feet must never count).
    this.seenMaskMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        tDepth: { value: this.sceneRT.depthTexture },
        uRes: this.asciiMat.uniforms.uRes,
        uNear: { value: 1 },
        uFar: { value: 200 },
        uMargin: { value: new THREE.Vector2(0.6, 1.5) }, // CONFIG.render.seenThrough, per frame
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform sampler2D tDepth;
        uniform vec2 uRes;
        uniform float uNear;
        uniform float uFar;
        uniform vec2 uMargin;
        ${IS_HERO_GLSL}
        void main() {
          vec2 uv = gl_FragCoord.xy / uRes;
          float a = texture2D(tScene, uv).a;
          float z = texture2D(tDepth, uv).r * 2.0 - 1.0;
          float lin = (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)) + (a < 0.03 ? uMargin.y : uMargin.x);
          gl_FragDepth = clamp(0.5 * (uFar + uNear - 2.0 * uNear * uFar / lin) / (uFar - uNear) + 0.5, 0.0, 1.0);
          // a figure of his own kind is never cover (a human boss is drawn through the hero's
          // materials): the two duel at arm's length, and the boss's tells must stay his own
          if (isHero(a)) gl_FragDepth = 1.0;
          gl_FragColor = vec4(0.0);
        }
      `,
      depthTest: true,
      depthFunc: THREE.GreaterEqualDepth,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    // 2. into sceneRT: what is left in seenRT (the hero where he is covered) goes over its cover,
    // colour, part id and his own depth, so the ASCII pass draws him there like anywhere else
    this.seenPatchMat = new THREE.ShaderMaterial({
      uniforms: {
        tSeen: { value: this.seenRT.texture },
        tSeenDepth: { value: this.seenRT.depthTexture },
        uRes: this.asciiMat.uniforms.uRes,
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSeen;
        uniform sampler2D tSeenDepth;
        uniform vec2 uRes;
        ${IS_HERO_GLSL}
        void main() {
          vec2 uv = gl_FragCoord.xy / uRes;
          vec4 s = texture2D(tSeen, uv);
          if (!isHero(s.a)) discard;
          gl_FragDepth = texture2D(tSeenDepth, uv).r;
          gl_FragColor = s;
        }
      `,
      depthTest: true,
      depthFunc: THREE.AlwaysDepth,
      depthWrite: true,
      blending: THREE.NoBlending,
    });

    // --- bloom
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThreshold: { value: CONFIG.render.bloomThreshold } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc;
        uniform float uThreshold;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb;
          float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.6, l), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc;
        uniform vec2 uDir;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
          c += texture2D(tSrc, vUv + uDir * 1.3846).rgb * 0.316216;
          c += texture2D(tSrc, vUv - uDir * 1.3846).rgb * 0.316216;
          c += texture2D(tSrc, vUv + uDir * 3.2308).rgb * 0.070270;
          c += texture2D(tSrc, vUv - uDir * 3.2308).rgb * 0.070270;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    // --- final grade
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tComp: { value: this.compRT.texture },
        tBloomA: { value: this.blur[1].texture },
        tBloomB: { value: this.blur[3].texture },
        uBloom: { value: CONFIG.render.bloomStrength },
        uExposure: { value: CONFIG.render.exposure },
        uTime: U.uTime,
        uAspect: { value: 1 },
        uHurt: { value: 0 }, // red edge flash 0..1
        uFade: { value: 0 }, // fade to black 0..1
        uDesat: { value: 0 }, // death desaturation 0..1
        uWarm: { value: 0 }, // boss-fight warm grade 0..1
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tComp;
        uniform sampler2D tBloomA;
        uniform sampler2D tBloomB;
        uniform float uBloom;
        uniform float uExposure;
        uniform float uTime;
        uniform float uAspect;
        uniform float uHurt;
        uniform float uFade;
        uniform float uDesat;
        uniform float uWarm;
        varying vec2 vUv;
        vec3 aces(vec3 x) {
          return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
        }
        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        void main() {
          vec3 col = texture2D(tComp, vUv).rgb;
          vec3 bloom = texture2D(tBloomA, vUv).rgb * 0.6 + texture2D(tBloomB, vUv).rgb * 0.9;
          col += bloom * uBloom;
          col *= uExposure;
          col = aces(col);
          // cool shadows / slightly warm highlights
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(col, col * vec3(0.92, 0.98, 1.08), (1.0 - l) * 0.5);
          col = mix(col, col * vec3(1.06, 0.98, 0.9), uWarm * 0.6);
          col = mix(col, vec3(l), uDesat * 0.85);
          vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
          float r = length(q);
          col *= mix(0.45, 1.0, smoothstep(0.95, 0.25, r));
          float edge = smoothstep(0.35, 0.95, r);
          col = mix(col, vec3(0.55, 0.02, 0.01), uHurt * edge * 0.75);
          col *= 1.0 - uFade;
          col = pow(max(col, 0.0), vec3(1.0 / 2.2));
          col += (hash12(gl_FragCoord.xy + fract(uTime * 7.3) * 113.0) - 0.5) * 0.018;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.width = 1;
    this.height = 1;
  }

  /**
   * The hero's letters follow his size (CONFIG.render.heroLetters; `ps` = U.uPlayerScreen): one
   * letter cell is `heroLetter` metres at his depth, so he is drawn with about the same letters on
   * a phone, at 720p and at 4K, and when the camera pulls in or out (a fixed 4 px cell gave a 1440p
   * screen twice the letters across his cloak). From `near` m in to `close` m, where the pass
   * fades from his far look to the close-up's line art (uHeroLod), the cell goes back to the fixed
   * one (a blend in log size): the title, an intro and the Lab's close-ups are drawn as they always
   * were (with the large cell their ink lines came out five pixels thick). The cell steps along
   * HERO_CELLS with `hyst` of slack (the fight's breathing camera must not flicker it), never
   * below the bosses' cell. Also the box that holds him (uSelfBox). No allocation once a
   * cell's atlas exists.
   */
  _updateHeroLetters(ps) {
    const u = this.asciiMat.uniforms, L = CONFIG.render.heroLetters ?? {};
    const ok = ps && Number.isFinite(ps.x + ps.y + ps.z) && ps.z > 0.5;
    const cell = ok ? this._letterCell(ps.z, this.selfCell.x) : this.heroCell.x;
    if (cell !== this.selfCell.x || !u.tSelfArt.value) {
      let art = this._selfArt.get(cell);
      if (!art) this._selfArt.set(cell, (art = createPixelArtAtlas(cell / 4)));
      this.selfCell.set(cell, cell);
      u.tSelfArt.value = art.texture;
      // the ink lines are one font pixel wide, in whole screen pixels
      u.uSelfPx.value = Math.max(1, Math.round(cell / 4 - (L.thin ?? 0.01)));
    }
    const b = u.uSelfBox.value;
    if (ok) {
      const rPx = (HERO_BOX_R * 0.5 * this.height * this.camera.projectionMatrix.elements[5]) / ps.z;
      b.set(ps.x * this.width, ps.y * this.height, rPx + 2 * cell, 1);
    } else b.w = 0;
  }

  /**
   * The letter cell (px) of a figure at view depth `z` (m) whose cell drawn now is `cur`: the rule
   * of _updateHeroLetters (one cell is `heroLetter` metres at that depth, back to the fixed bosses'
   * cell from `near` m in to `close` m, a step along HERO_CELLS with `hyst` of slack, never below the
   * fixed cell). The hero's and a boss's that follows his size (_updateBossLetters).
   */
  _letterCell(z, cur) {
    const L = CONFIG.render.heroLetters ?? {};
    const min = this.heroCell.x;
    if (!(this.heroLetter > 0) || !(Number.isFinite(z) && z > 0.5)) return min;
    const near = L.near ?? 20, close = Math.min(L.close ?? 6, near - 0.01);
    const ppm = (0.5 * this.height * this.camera.projectionMatrix.elements[5]) / Math.max(z, near);
    let t = Math.min(1, Math.max(0, (z - close) / (near - close)));
    t = t * t * (3 - 2 * t);
    const want = Math.log(min) + (Math.log(Math.max(min, ppm * this.heroLetter)) - Math.log(min)) * t;
    // the step nearest in log size; the one drawn now is kept until the wanted size is `hyst`
    // past the midpoint to the next
    let best = min, bd = Infinity;
    for (const c of HERO_CELLS) {
      if (c < min) continue;
      const d = Math.abs(Math.log(c) - want);
      if (d < bd) { bd = d; best = c; }
    }
    const keep = cur >= min && HERO_CELLS.includes(cur) && Math.abs(Math.log(cur) - want) < bd + 2 * (L.hyst ?? 0.06);
    return keep ? cur : best;
  }

  /**
   * A boss's letters follow his size as the hero's do, when `bossLetters` is set (main.js, from the
   * boss's kit: `kit.letters`, Wen Yao; ?foxLetters=a turns it off): the bosses' ink-line cell
   * (uHeroCell, its atlas tHeroArt, its line width uHeroPx.x) from his view depth (`bs` =
   * U.uBossScreen) by _letterCell, the hero's rule. His paper selves share it (one grid for every
   * boss pixel). Off, the uniforms are exactly what setSize gives (the fixed cell): a level whose boss
   * does not ask is drawn as before. The atlases are the hero's (_selfArt): no allocation once a cell's
   * atlas exists.
   */
  _updateBossLetters(bs) {
    const u = this.asciiMat.uniforms;
    if (!this.bossLetters) {
      if (this._bossOn) {
        this._bossOn = false;
        u.uHeroCell.value = this.heroCell;
        if (this.heroArt) u.tHeroArt.value = this.heroArt.texture;
        u.uHeroPx.value.x = this._heroPx ?? 1;
      }
      return;
    }
    this._bossOn = true;
    const cur = this.bossCell.x;
    const seen = bs && bs.w > 0.5 && Number.isFinite(bs.x + bs.y + bs.z) && bs.z > 0.5;
    // his depth 1 m above his feet, where the hero's is taken (U.uBossScreen is his root's: the depth
    // along the view of a point 1 m up is the root's plus the view direction's y, -matrixWorld[9]);
    // a hidden boss keeps the cell he had
    const z = seen ? bs.z - this.camera.matrixWorld.elements[9] : NaN;
    // (the rule's own cell, kept apart from a bias: its hysteresis runs on it)
    const base = this._bossBase || cur;
    let cell = seen ? this._letterCell(z, base) : Math.max(base, this.heroCell.x);
    this._bossBase = cell;
    // a kit's letterBias (main.js: bossLetterBias): that many steps along HERO_CELLS bolder, on a small
    // frame only (under BOSS_BIAS_H px tall: a phone, where the rule rests on the fixed cell)
    const bias = this.bossLetterBias | 0;
    if (bias && this.height < BOSS_BIAS_H) cell = HERO_CELLS[Math.min(HERO_CELLS.length - 1, Math.max(0, HERO_CELLS.indexOf(cell) + bias))] ?? cell;
    let art = this._selfArt.get(cell);
    if (!art) this._selfArt.set(cell, (art = createPixelArtAtlas(cell / 4)));
    const px = Math.max(1, Math.round(cell / 4 - (CONFIG.render.heroLetters?.thin ?? 0.01)));
    // (compared every frame: setSize writes the fixed cell's atlas and line width back)
    if (cell !== cur || u.uHeroCell.value !== this.bossCell || u.tHeroArt.value !== art.texture || u.uHeroPx.value.x !== px) {
      this.bossCell.set(cell, cell);
      u.uHeroCell.value = this.bossCell;
      u.tHeroArt.value = art.texture;
      u.uHeroPx.value.x = px;
    }
  }

  /** Camera-dependent uniforms of the ASCII pass (world reconstruction for stone outlines). */
  _updateAsciiCamera() {
    const u = this.asciiMat.uniforms;
    const cam = this.camera;
    u.uInvViewProj.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    // the hero's halo: round his screen position (U.uPlayerScreen: uv 1 m above his feet, view
    // depth), a radius that covers his drawn figure, sword and coat (HERO_HALO_R m), fading in with
    // the view depth (none in the Lab's close-ups)
    const ps = this.U.uPlayerScreen?.value;
    const h = u.uHeroHalo.value, hs = u.uHeroHaloShape.value;
    if (ps && Number.isFinite(ps.x + ps.y + ps.z) && ps.z > 0.5) {
      const rPx = (HERO_HALO_R * 0.5 * this.height * cam.projectionMatrix.elements[5]) / ps.z;
      const k = Math.min(1, Math.max(0, (ps.z - hs.w * 0.4) / (hs.w * 0.6)));
      h.set(ps.x, ps.y, rPx, k * k * (3 - 2 * k));
    } else h.w = 0;
    this._updateHeroLetters(ps);
    this._updateBossLetters(this.U.uBossScreen?.value);
    // the impact ripple's live hits, projected with the camera that draws this frame (setRipple)
    if (this.ripple) {
      try {
        this.ripple.write(this);
      } catch (err) {
        u.uRipN.value = 0;
        console.error('[ripple] write failed', err);
        this.ripple = null;
      }
    }
    // the time rip's live cuts (strip / negative), projected with the same camera (setTimeRip)
    if (this.timeRip) {
      try {
        this.timeRip.write(this);
      } catch (err) {
        u.uCutN.value = 0;
        console.error('[timeRip] write failed', err);
        this.timeRip = null;
      }
    }
    // (the wyrm's grid anchor: _updateWyrmGrid, before the scene pass)
    // the props' grid anchor: where the world's ground origin would be on screen if the whole ground
    // moved like the ground at the focus (the screen position of the focus, minus the focus's world
    // offset times the px-per-metre there), wrapped to one cell
    const F = this.U.uFocus?.value;
    if (F && Number.isFinite(F.x + F.z)) {
      const v = (this._v ??= new THREE.Vector3());
      const W = this.width, H = this.height;
      v.set(F.x, 0, F.z).project(cam);
      const x0 = (v.x * 0.5 + 0.5) * W, y0 = (v.y * 0.5 + 0.5) * H;
      v.set(F.x + 1, 0, F.z).project(cam);
      const jxx = (v.x * 0.5 + 0.5) * W - x0, jxy = (v.y * 0.5 + 0.5) * H - y0;
      v.set(F.x, 0, F.z + 1).project(cam);
      const jzx = (v.x * 0.5 + 0.5) * W - x0, jzy = (v.y * 0.5 + 0.5) * H - y0;
      const ax = x0 - (jxx * F.x + jzx * F.z), ay = y0 - (jxy * F.x + jzy * F.z);
      const cw = this.artCell.x, ch = this.artCell.y;
      if (Number.isFinite(ax + ay)) u.uPropAnchor.value.set(((Math.round(ax) % cw) + cw) % cw, ((Math.round(ay) % ch) + ch) % ch);
    }
  }

  /**
   * The wyrm's letter grid: its anchor is its root on screen, in whole px (the letters stay
   * pixel-exact). Set before the scene pass: the wyrm's materials count the same cells when it
   * dissolves letter by letter (letGo.js, U.uWyrmGrid).
   */
  _updateWyrmGrid() {
    const a = this.asciiMat.uniforms.uWyrmAnchor.value;
    const bs = this.U.uBossScreen?.value;
    if (bs && bs.w > 0.5 && Number.isFinite(bs.x + bs.y)) a.set(Math.round(bs.x * this.width), Math.round(bs.y * this.height));
    this.asciiMat.uniforms.uWyrmGrid.value.set(this.artCell.x, this.artCell.y, a.x, a.y);
  }

  /** The impact ripple (impactRipple.js; null: none): its write(pipeline) fills uRipN / uRipA / uRipB right before the ASCII pass. */
  setRipple(ripple) {
    this.ripple = ripple ?? null;
    if (!this.ripple) this.asciiMat.uniforms.uRipN.value = 0;
  }

  /** The time rip (player/timeRip.js; null: none): its write(pipeline) fills uCutN / uCutA / uCutB right before the ASCII pass. */
  setTimeRip(rip) {
    this.timeRip = rip ?? null;
    if (!this.timeRip) this.asciiMat.uniforms.uCutN.value = 0;
  }

  /** The fire field (render/fireField.js): its heat passes run after the scene pass, its letters draw first in the FX pass. */
  registerFire(field) {
    this.fire = field;
    field.init(this.rtType, this.sceneRT.depthTexture);
    this.fxScene.add(field.mesh);
    this.asciiMat.uniforms.tFlame.value = field.flameRT.texture;
    if (field.hazeVoid) this.asciiMat.uniforms.uHazeVoid.value = field.hazeVoid;
    if (this.art) field.setSize(this.width, this.height, this.artCell, this.art, this._minCell ?? this.artCell);
  }

  /**
   * The object printed through whatever covers it on screen (ADR-106): the hero's root (main.js),
   * or null for none. It is drawn a second time, alone, every frame it is on screen.
   */
  setSeenThrough(root) {
    this.seenRoot = root ?? null;
  }

  /**
   * Render step 2b (ADR-106), right after the world pass: the seen-through object alone into
   * seenRT, inside the box round the hero's screen point (U.uPlayerScreen; CONFIG.render.seenThrough
   * `reach`); then the quad that erases what the scene shows of it (seenMaskMat); then what is left
   * into sceneRT (seenPatchMat). Sets uSeen for the ASCII pass and returns true when it ran: not
   * with the switch off, without an object, while the object is hidden, with a non-finite or
   * too-near screen point, off screen, or while the probe finds nothing in front of him
   * (_seenProbe). No allocation; the renderer's autoClear and the scene target's scissor are left
   * as they were.
   */
  _renderSeen() {
    const u = this.asciiMat.uniforms.uSeen.value, r = this.renderer, cam = this.camera;
    const S = CONFIG.render.seenThrough, root = this.seenRoot, ps = this.U.uPlayerScreen?.value;
    u.w = 0;
    if (!S?.on || !root || root.visible === false || !ps || !(ps.z > 0.5)) return false;
    const W = this.width, H = this.height;
    const rPx = Math.ceil((S.reach * 0.5 * H * cam.projectionMatrix.elements[5]) / ps.z);
    const cx = ps.x * W, cy = ps.y * H;
    if (!Number.isFinite(cx + cy + rPx)) return false;
    const x0 = Math.max(0, Math.floor(cx - rPx)), y0 = Math.max(0, Math.floor(cy - rPx));
    const x1 = Math.min(W, Math.ceil(cx + rPx)), y1 = Math.min(H, Math.ceil(cy + rPx));
    if (!(x1 > x0 && y1 > y0)) return false; // he is off screen
    if (!this._seenProbe(root, cx, ps.z)) return false; // nothing stands in front of him
    const seen = this.seenRT, sceneRT = this.sceneRT, prevClear = r.autoClear;
    seen.scissor.set(x0, y0, x1 - x0, y1 - y0);
    sceneRT.scissor.set(x0, y0, x1 - x0, y1 - y0);
    try {
      // the object alone (its own materials: colour, part ids, depth), the box cleared first
      r.autoClear = true;
      r.setRenderTarget(seen);
      r.setClearColor(0x000000, 0);
      r.render(root, cam);
      // ... minus what the scene shows of it
      r.autoClear = false;
      const m = this.seenMaskMat.uniforms;
      m.uNear.value = cam.near;
      m.uFar.value = cam.far;
      m.uMargin.value.set(S.margin, S.bareMargin);
      this.fs.render(r, this.seenMaskMat, seen);
      // ... and the rest over its cover in the scene target
      sceneRT.scissorTest = true;
      this.fs.render(r, this.seenPatchMat, sceneRT);
    } finally {
      sceneRT.scissorTest = false;
      r.autoClear = prevClear;
    }
    u.set(ps.x, ps.y, rPx - 2, 1);
    return true;
  }

  /**
   * The gate of the seen-through pass: true while it must run. Every frame it reads the answer of
   * the last probe when it is there, and sends a new one: a quad over the screen rect of a slab
   * through the hero's body (CONFIG.render.seenThrough.probe, above `root`'s origin; `cx` = his
   * screen x in px, `depth` = his view depth in m), at his centre line's depth less the margin (a
   * little less pulled than the pass's own test, so whatever the pass would print is found),
   * depth-tested against the scene in an ANY_SAMPLES_PASSED query. A yes keeps the pass running
   * for `hold` frames. No answer for a few frames (a hidden tab, frames stepped in one task)
   * counts as a yes; without usable queries the pass runs every frame. No allocation.
   */
  _seenProbe(root, cx, depth) {
    const G = this.seenGate, S = CONFIG.render.seenThrough, r = this.renderer, cam = this.camera;
    if (G.off) return true;
    let gl = G.gl;
    if (!gl) {
      gl = G.gl = typeof r.getContext === 'function' ? r.getContext() : null;
      if (!gl || typeof gl.createQuery !== 'function') {
        G.off = true;
        return true;
      }
      G.hold = S.hold + 1; // until the first answer: as if he were covered
    }
    const sceneRT = this.sceneRT, prevClear = r.autoClear;
    try {
      if (G.pending) {
        if (gl.getQueryParameter(G.query, gl.QUERY_RESULT_AVAILABLE)) {
          if (gl.getQueryParameter(G.query, gl.QUERY_RESULT)) G.hold = S.hold + 1;
          G.pending = false;
        } else if (++G.age > 3) G.hold = S.hold + 1;
      }
      if (G.hold > 0) G.hold--;
      if (!G.pending) {
        // the slab's foot and top: view depth and screen y of the two points above his origin
        const e = root.matrixWorld.elements, v = cam.matrixWorldInverse.elements, P5 = cam.projectionMatrix.elements[5];
        const W = this.width, H = this.height, pr = S.probe;
        const ya = e[13] + pr[1], yb = e[13] + pr[2];
        const da = -(v[2] * e[12] + v[6] * ya + v[10] * e[14] + v[14]), db = -(v[2] * e[12] + v[6] * yb + v[10] * e[14] + v[14]);
        const sa = ((P5 * (v[1] * e[12] + v[5] * ya + v[9] * e[14] + v[13])) / da) * 0.5 * H + 0.5 * H;
        const sb = ((P5 * (v[1] * e[12] + v[5] * yb + v[9] * e[14] + v[13])) / db) * 0.5 * H + 0.5 * H;
        const hw = (pr[0] * 0.5 * H * P5) / depth;
        const x0 = Math.max(0, Math.floor(cx - hw)), x1 = Math.min(W, Math.ceil(cx + hw));
        const y0 = Math.max(0, Math.floor(Math.min(sa, sb))), y1 = Math.min(H, Math.ceil(Math.max(sa, sb)));
        if (da > 0.5 && db > 0.5 && Number.isFinite(sa + sb + hw) && x1 > x0 && y1 > y0) {
          const u = this.seenProbeMat.uniforms, pull = Math.max(0, S.margin - 0.1);
          u.uProbe.value.set(sa, sb, da - pull, db - pull);
          u.uNear.value = cam.near;
          u.uFar.value = cam.far;
          sceneRT.scissor.set(x0, y0, x1 - x0, y1 - y0);
          sceneRT.scissorTest = true;
          r.autoClear = false;
          G.query ??= gl.createQuery();
          gl.beginQuery(gl.ANY_SAMPLES_PASSED, G.query);
          try {
            this.fs.render(r, this.seenProbeMat, sceneRT);
          } finally {
            gl.endQuery(gl.ANY_SAMPLES_PASSED);
          }
          G.pending = true;
          G.age = 0;
        }
      }
    } catch (err) {
      // a browser whose queries fail: the pass simply runs every frame from here on
      G.off = true;
      G.pending = false;
      console.warn('seen-through: occlusion queries unavailable, the pass runs every frame', err);
      return true;
    } finally {
      sceneRT.scissorTest = false;
      r.autoClear = prevClear;
    }
    return G.hold > 0;
  }

  registerParticles(particleSystem) {
    this.fxParticleMaterials.push(particleSystem);
    particleSystem.uniforms.uDepth.value = this.sceneRT.depthTexture;
    this.fxScene.add(particleSystem.mesh);
  }

  setSize(cssW, cssH, dpr) {
    const r = this.renderer;
    r.setPixelRatio(dpr);
    r.setSize(cssW, cssH, false);
    const W = Math.max(1, Math.floor(cssW * dpr));
    const H = Math.max(1, Math.floor(cssH * dpr));
    this.width = W;
    this.height = H;
    this.sceneRT.setSize(W, H);
    this.seenRT.setSize(W, H);
    this.compRT.setSize(W, H);
    this.brightRT.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1));
    this.blur[0].setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
    this.blur[1].setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
    this.blur[2].setSize(Math.max(1, W >> 3), Math.max(1, H >> 3));
    this.blur[3].setSize(Math.max(1, W >> 3), Math.max(1, H >> 3));
    this.U.uResolution.value.set(W, H);
    this.asciiMat.uniforms.uRes.value.set(W, H);
    this.finalMat.uniforms.uAspect.value = W / H;

    // character cell scales with vertical resolution (terminal-sized glyphs at 1080p)
    const cellH = Math.max(9, Math.min(24, Math.round(H / 90)));
    const cellW = Math.max(5, Math.round(cellH * 0.6));
    // the wyrm's ASCII art: pixel-font digits in cells ~1/90 of the height (5x8 px at 720p, 6x9 at
    // 1080p, 4x6 on a phone; wyrmGlyphs.js wyrmArtFont), and below it the zoom ladder (?zoomArt):
    // every smaller font, each with its own atlas and a screen-grid cell scaled alike (9 px tall at
    // least: the grid's canvas letters stop reading below it). Option a builds the first step only.
    const ladder = this.zoomArt === 'a' ? wyrmArtLadder(H).slice(0, 1) : wyrmArtLadder(H);
    const key = ladder.map((f) => `${f.font}x${f.s}`).join(',') + `|${cellW}x${cellH}`;
    if (key !== this._ladderKey) {
      for (const f of this.zoomLadder) f.atlas?.texture.dispose();
      for (const g of this._gridCache.values()) g.texture.dispose();
      this._gridCache.clear();
      this.grid = null;
      this.art = null;
      this._ladderKey = key;
      const ch0 = ladder[0].cell[1];
      this.zoomLadder = ladder.map((f, i) => {
        const gh = i === 0 ? cellH : Math.max(9, Math.min(cellH, Math.round((cellH * f.cell[1]) / ch0)));
        const gw = i === 0 ? cellW : Math.max(5, Math.round(gh * 0.6));
        const gk = `${gw}x${gh}`;
        if (!this._gridCache.has(gk)) this._gridCache.set(gk, createGridAtlas(gw, gh));
        return { key: `${f.font}x${f.s}`, cell: f.cell, atlas: createWyrmArtAtlas(f.font, f.s), gridCell: [gw, gh], grid: this._gridCache.get(gk) };
      });
      this._zoomHs = this.zoomLadder.map((f) => f.cell[1]);
      this.zoomStep = 0;
      // upload every step's atlases now: the first frame drawn after a step must not upload one
      for (const f of this.zoomLadder) {
        this.renderer.initTexture?.(f.atlas.texture);
        this.renderer.initTexture?.(f.grid.texture);
      }
    }
    const fin = this.zoomLadder[this.zoomLadder.length - 1].cell;
    this._minCell = (this._minCell ??= new THREE.Vector2()).set(fin[0], fin[1]);
    this._applyZoomStep(Math.min(this.zoomStep, this.zoomLadder.length - 1), true);
    const hs = Math.max(1, Math.floor(H / 1080));
    const [heroW, heroH] = pixelArtCell(hs);
    if (!this.heroArt || heroW !== this.heroCell.x || heroH !== this.heroCell.y) {
      this.heroArt?.texture.dispose();
      this.heroCell.set(heroW, heroH);
      this.heroArt = createPixelArtAtlas(hs);
      this.asciiMat.uniforms.tHeroArt.value = this.heroArt.texture;
      this.asciiMat.uniforms.uHeroCount.value = this.heroArt.count;
      this.asciiMat.uniforms.uHeroCols.value = this.heroArt.cols;
    }
    this.asciiMat.uniforms.uHeroPx.value.x = hs; // the ink lines are one font pixel wide
    this._heroPx = hs; // (_updateBossLetters gives it back when a boss's letters stop following his size)
  }

  /** Resize the moon shadow map to `size` × `size` texels (quality presets; main.js applyQuality). */
  setShadowSize(size) {
    const S = Math.round(Number(size));
    if (!Number.isFinite(S) || S < 16 || S === this.shadowSize) return;
    this.shadowSize = S;
    this.shadowRT.setSize(S, S);
    this.U.uShadowTexel.value = 1 / S;
  }

  updateShadowCamera(center) {
    const E = CONFIG.render.shadowExtent;
    const dir = this.U.uMoonDir.value;
    // snap to texel grid to avoid shimmering when the center moves
    const texel = (2 * E) / this.shadowSize;
    this.shadowCenter.set(Math.round(center.x / texel) * texel, 0, Math.round(center.z / texel) * texel);
    this.shadowCam.position.copy(this.shadowCenter).addScaledVector(dir, 160);
    this.shadowCam.lookAt(this.shadowCenter);
    this.shadowCam.updateMatrixWorld();
    this.U.uShadowMatrix.value
      .copy(this.shadowBias)
      .multiply(this.shadowCam.projectionMatrix)
      .multiply(this.shadowCam.matrixWorldInverse);
  }

  /**
   * Draw the art cell and the screen grid at zoom ladder step `i` (0 = the frame size's own font):
   * every reader of the cell switches together (the ASCII pass's uniforms, shed digits and the let-go
   * share them; the fire field's print and passes; artCell for dragon.js and the duelists' flare,
   * read in the next frame's update, before this cell is drawn). `resized`: the frame size changed
   * (the fire field re-allocates for the ladder's finest cell). No allocation.
   */
  _applyZoomStep(i, resized = false) {
    const f = this.zoomLadder[i];
    if (!f) return;
    const u = this.asciiMat.uniforms;
    this.zoomStep = i;
    if (this.art !== f.atlas) {
      this.artFont = f.key;
      this.art = f.atlas;
      this.artCell.set(f.cell[0], f.cell[1]);
      u.tArt.value = f.atlas.texture;
      u.uWyrmAtlas.value.set(f.atlas.sets[0], f.atlas.sets[1], f.atlas.sets[2], f.atlas.total);
      const k = i > 0 && f.atlas.ink > 0 ? this.zoomLadder[0].atlas.ink / f.atlas.ink : 1;
      u.uArtInk.value = Number.isFinite(k) ? Math.min(1.25, Math.max(0.75, k)) : 1;
    }
    if (this.grid !== f.grid) {
      this.grid = f.grid;
      this.cell.set(f.gridCell[0], f.gridCell[1]);
      u.tGrid.value = f.grid.texture;
    }
    if (resized) this.fire?.setSize(this.width, this.height, this.artCell, this.art, this._minCell);
    else this.fire?.setCell(this.artCell, this.art);
  }

  /** Switch the zoom option live: 'a' | 'b' | 'c' (rebuilds the ladder for this frame size). */
  setZoomArt(mode) {
    const m = mode === 'b' || mode === 'c' ? mode : 'a';
    if (m === this.zoomArt) return;
    this.zoomArt = m;
    this._ladderKey = '';
    this.zoomStep = 0;
    const dpr = this.renderer.getPixelRatio?.() || 1;
    if (this.width > 0 && this.height > 0) this.setSize(this.width / dpr, this.height / dpr, dpr);
  }

  /**
   * The camera's distance to the ground along its view axis (m): the rig's own distance at its
   * focus. 0 when it does not look down steeply enough to count (CONFIG.camera.zoomArt.minPitch).
   */
  zoomDistance(cam = this.camera) {
    const e = cam?.matrixWorld?.elements;
    if (!e) return 0;
    // the camera looks along -z: its world direction is -(e[8], e[9], e[10])
    const len = Math.hypot(e[8], e[9], e[10]);
    const sn = len > 1e-6 ? e[9] / len : 0; // the sine of the look-down angle
    const y = e[13];
    if (!(sn >= (CONFIG.camera.zoomArt?.minPitch ?? 0.35)) || !(y > 0)) return 0;
    const D = y / sn;
    return Number.isFinite(D) ? D : 0;
  }

  /**
   * After a frame: pick the zoom ladder step for the zoom that drew it (wyrmGlyphs.js zoomArtStep,
   * with its hysteresis) and switch to it for the next frame. The zoom is the player's own:
   * camera.userData.zoomRatio, the rig's eased wheel distance over its default (cameraRig.js); a
   * camera without a rig (tests, tools): its distance to the ground over CONFIG.camera.distance.
   * Option a, a phone (camera.userData.zoomArtOff) and a camera that does not look down stay on
   * step 0.
   */
  updateZoomArt() {
    if (this._zoomHs.length < 2) return;
    const Z = CONFIG.camera.zoomArt ?? {}, ud = this.camera?.userData;
    const p = this.zoomArt === 'a' || ud?.zoomArtOff ? 0 : Z.strength?.[this.zoomArt] ?? 0;
    let r = 1;
    if (p > 0) {
      if (ud?.zoomRatio > 0 && Number.isFinite(ud.zoomRatio)) r = ud.zoomRatio;
      else {
        const D = this.zoomDistance();
        if (D > 0) r = D / CONFIG.camera.distance;
      }
    }
    const i = zoomArtStep(this._zoomHs, r, p, this.zoomStep, Z.hyst ?? 0.1);
    if (i !== this.zoomStep) {
      const t0 = performance.now();
      this._applyZoomStep(i);
      this.zoomStepMs = performance.now() - t0;
      this.zoomSteps = (this.zoomSteps ?? 0) + 1;
    }
  }

  render() {
    const r = this.renderer, scene = this.scene;
    const prevAutoClear = r.autoClear;

    // 0. the scene graph's world matrices, once for both scene passes (three would walk it again
    // in each render), then the rigid batches' bones from them (the drawn state: the hero's lean
    // is on by now)
    const prevAutoUpdate = scene.matrixWorldAutoUpdate;
    this._updateWyrmGrid();
    scene.updateMatrixWorld();
    this.rigid.sync();
    scene.matrixWorldAutoUpdate = false;
    try {
      // 1. shadows: the plain casters, then the batched actors (one draw each) into the same map
      scene.overrideMaterial = this.shadowMat;
      r.setRenderTarget(this.shadowRT);
      r.setClearColor(0xffffff, 1);
      r.clear();
      r.render(scene, this.shadowCam);
      if (this.rigid.casting) {
        scene.overrideMaterial = this.rigidShadowMat;
        this.shadowCam.layers.set(LAYER_CASTER_RIGID);
        r.autoClear = false;
        r.render(scene, this.shadowCam);
      }

      // 2. world
      scene.overrideMaterial = null;
      r.autoClear = prevAutoClear;
      const fog = this.U.uFogColor.value;
      r.setRenderTarget(this.sceneRT);
      r.setClearColor(fog, 0);
      r.clear();
      r.render(scene, this.camera);
      // 2b. the hero where something covers him, back into the scene target
      this._renderSeen();
    } finally {
      scene.overrideMaterial = null;
      this.shadowCam.layers.set(LAYER_CASTER);
      r.autoClear = prevAutoClear;
      scene.matrixWorldAutoUpdate = prevAutoUpdate;
    }

    // 2b. the fire field: blobs -> heat -> flame texture (reads the scene depth)
    if (this.fire) {
      this.fire.render(r, this.camera, this.fs);
      this.asciiMat.uniforms.uFlame.value.set(this.fire.alloc?.x ?? this.fire.cells.x, this.fire.alloc?.y ?? this.fire.cells.y, this.fire.active ? 1 : 0, 0);
      this.asciiMat.uniforms.uFlameCells.value.copy(this.fire.cells);
    }

    // 3. ASCII grid
    this._updateAsciiCamera();
    this.fs.render(r, this.asciiMat, this.compRT);

    // 4. FX particles on top (manual soft depth test)
    for (const p of this.fxParticleMaterials) {
      p.uniforms.uNear.value = this.camera.near;
      p.uniforms.uFar.value = this.camera.far;
    }
    r.autoClear = false;
    r.setRenderTarget(this.compRT);
    r.render(this.fxScene, this.camera);
    r.autoClear = prevAutoClear;

    // 5. bloom
    this.brightMat.uniforms.tSrc.value = this.compRT.texture;
    this.fs.render(r, this.brightMat, this.brightRT);
    const blurPass = (src, dst, dx, dy) => {
      this.blurMat.uniforms.tSrc.value = src.texture;
      this.blurMat.uniforms.uDir.value.set(dx / src.width, dy / src.height);
      this.fs.render(r, this.blurMat, dst);
    };
    blurPass(this.brightRT, this.blur[0], 1, 0);
    blurPass(this.blur[0], this.blur[1], 0, 1);
    blurPass(this.blur[1], this.blur[2], 1, 0);
    blurPass(this.blur[2], this.blur[3], 0, 1);

    // 6. final
    this.fs.render(r, this.finalMat, null);

    // the letters for the next frame (?zoomArt): every reader sees a step from the same frame on
    this.updateZoomArt();
  }
}
