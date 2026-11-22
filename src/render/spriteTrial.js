import * as THREE from 'three';
import { HERO_ART, FLAG } from './materials.js';

// THE SPRITE TRIAL (`?sprites=glyph|print|pixel`, default off; the owner's look trial of
// 2026-11-21, behind a switch on purpose: it breaks STYLE.md's "never a scaled sprite" rule).
// The hero and the Cinder Wyrm are drawn as flat 2D drawings on camera-facing cards that follow
// them; their 3D meshes stay in the scene, posed and animated as before (hit detection, the sword
// trail, the fire, the shadows and the camera read them), only no longer drawn in the world pass.
//
//   glyph  the artist's baked ASCII PNGs (real characters on a 5x8 / 4x4 px grid), as they are
//   print  the dark engraving pixel art, printed by the game's own ASCII pass: the card writes the
//          drawing into the scene target in the hero's art window (his micro-font, his ink lines
//          round the silhouette, his dark halo) or the wyrm's (its digits, its stroke outline, and
//          stroke codes where the drawing has a hard light edge inside)
//   pixel  the same engraving pixel art as plain nearest-neighbour pixels, no letters
//
// One pose each, no animation. The hero card shows the S (front) figure while he faces the camera's
// half and the N (back) one while he faces away, mirrored so the sword is on the side he turns to;
// the wyrm's card is mirrored so its head is on the side it faces. Both with hysteresis.
// Nothing here is created unless the switch is on (seeded sims: no new objects by default).

/** The modes, in the Lab's order. */
export const SPRITE_MODES = ['glyph', 'print', 'pixel'];

/** The mode named by `?sprites=` (null: off). */
export function spriteModeFromSearch(search) {
  try {
    const v = new URLSearchParams(search ?? '').get('sprites');
    return SPRITE_MODES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

/** The alpha the raw modes write: the art pass copies these pixels through untouched (pipeline.js isSpriteRaw). */
export const SPRITE_RAW_FLAG = 0.035;

const ROOT = 'assets/sprites/';
// The drawings. ppm = image px per metre of the figure's real height (the hero's 72 px stand for his
// drawn 1.94 m, the wyrm's 278 px shoulder for 7.5 m: 37 px/m; the hero's glyph sheet draws his
// 72 px figure 319 px tall). frames: the figures side by side (the hero: S, then N). pivot: the
// point that stands on the actor's ground position (frame uv, from the lower left; the figure's
// body column and its soles; the wyrm: under the body, between its near and far feet).
// fig: the hero's figure height in image px (sole to crown).
const ART = {
  hero: {
    glyph: { file: 'hero_glyph_v02.png', w: 240, h: 320, frames: 2, fig: 319, ppm: 319 / 1.94, pivot: [[0.56, 1 / 320], [0.44, 1 / 320]] },
    dark: { file: 'hero_dark1_v02.png', w: 128, h: 80, frames: 2, fig: 72, ppm: 72 / 1.94, pivot: [[0.53, 4 / 80], [0.47, 4 / 80]] },
  },
  wyrm: {
    glyph: { file: 'wyrm_glyph_v04.png', w: 952, h: 552, frames: 1, ppm: 278 / 7.5, pivot: [[0.47, 42 / 552]] },
    dark: { file: 'wyrm_dark1_v01.png', w: 952, h: 550, frames: 1, ppm: 278 / 7.5, pivot: [[0.47, 40 / 550]] },
  },
};
/** The crown of the hero's gameplay body (m): his drawings stand this tall (player.js unlean / leanPoint). */
const HERO_CROWN = 1.85;
/** Facing hysteresis: the dot product past which a side switches (≈ 9° each side of the line). */
const HYST = 0.15;
/** The hero's art part ids the print mode writes (player/model.js HERO_INK): coat, blade, leather. */
const HERO_PART = { coat: 6, blade: 17, leather: 10 };

const VERT = /* glsl */ `
  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  uniform vec3 uAnchor;
  uniform vec4 uCard; // x, y = the card's world size (m), z, w = the pivot (card uv)
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec2 q = (uv - uCard.zw) * uCard.xy;
    vec3 wp = uAnchor + uCamRight * q.x + uCamUp * q.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec4 uFrame;   // the figure's rect in the texture: x, y (lower left), w, h (uv)
  uniform vec2 uTexel;   // 1 / texture size
  uniform float uMirror; // 1: the drawing is mirrored left-right
  uniform float uMode;   // 0 raw (glyph, pixel), 1 print as the hero, 2 print as the wyrm
  uniform vec4 uGain;    // rgb gain on the drawing's linear colour, w = the brightest it may print (HDR: blooms past 1)
  uniform vec4 uEdge;    // wyrm print: x = light step that makes an inner stroke, y = 1 strokes on
  varying vec2 vUv;
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  vec4 tap(vec2 st) {
    vec2 lo = uFrame.xy, hi = uFrame.xy + uFrame.zw;
    if (st.x < lo.x || st.y < lo.y || st.x > hi.x || st.y > hi.y) return vec4(0.0);
    return texture2D(uTex, st);
  }
  void main() {
    vec2 u = vec2(uMirror > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
    // nearest texel centre (no filtering, hard alpha)
    vec2 st = uFrame.xy + u * uFrame.zw;
    st = (floor(st / uTexel) + 0.5) * uTexel;
    vec4 t = texture2D(uTex, st);
    if (t.a < 0.5) discard;
    vec3 c = t.rgb;
    if (uMode < 0.5) {
      gl_FragColor = vec4(c * uGain.rgb, ${SPRITE_RAW_FLAG.toFixed(3)});
      return;
    }
    float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
    float sat = (mx - mn) / max(mx, 1e-4);
    vec3 col = c * uGain.rgb;
    if (uMode < 1.5) {
      // the hero: his art window, a part id per pixel (the bright cyan steel = the blade, warm
      // pixels = leather, the rest = the coat); the pass draws his ink lines round each part
      float part = ${HERO_PART.coat.toFixed(1)};
      if (luma(c) > 0.25 && c.b >= c.r) part = ${HERO_PART.blade.toFixed(1)};
      else if (sat > 0.35 && c.r > c.b * 1.4) part = ${HERO_PART.leather.toFixed(1)};
      if (part > 16.5) col = c * vec3(0.8, 1.2, 1.6) * uGain.w; // the steel glows like his blade
      gl_FragColor = vec4(col, ${HERO_ART.a0.toFixed(4)} + part * 2.0 * ${HERO_ART.step.toFixed(4)});
      return;
    }
    // the wyrm: its art window. The gain lifts the dark hide into the letters' range; the brightest
    // (the lava seams, the eye, the maw) are held under uGain.w so they bloom as its embers do, not
    // as a blur. A hard light step inside the drawing writes a stroke code along it
    float cm = max(max(col.r, col.g), col.b);
    if (cm > uGain.w) col *= uGain.w / cm;
    float code = 0.0;
    if (uEdge.y > 0.5) {
      vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
      vec4 r = tap(st + dx), l = tap(st - dx), up = tap(st + dy), dn = tap(st - dy);
      float lc = luma(c);
      // (off the drawing counts as its own light: the silhouette is outlined by the pass itself)
      float lr = r.a > 0.5 ? luma(r.rgb) : lc, ll = l.a > 0.5 ? luma(l.rgb) : lc;
      float lu = up.a > 0.5 ? luma(up.rgb) : lc, ld = dn.a > 0.5 ? luma(dn.rgb) : lc;
      vec2 gr = vec2(lr - ll, lu - ld) * 0.5;
      if (uMirror > 0.5) gr.x = -gr.x;
      float gm = length(gr);
      // the lit side of the step draws it (one stroke, not two)
      if (gm > uEdge.x && lc >= 0.5 * (lr + ll + lu + ld) * 0.5) {
        float phi = mod(atan(gr.y, gr.x) + 1.5707963, 3.14159265);
        code = mod(floor(phi / 0.7853982 + 0.5), 4.0) + 1.0;
      }
    }
    gl_FragColor = vec4(col, ${FLAG.ART.toFixed(2)} + code * 0.01);
  }
`;

class Card {
  constructor(U, tex, art) {
    this.art = art;
    this.frame = 0;
    this.mirror = false;
    this.uniforms = {
      uCamRight: U.uCamRight,
      uCamUp: U.uCamUp,
      uAnchor: { value: new THREE.Vector3() },
      uCard: { value: new THREE.Vector4(1, 1, 0.5, 0) },
      uTex: { value: tex },
      uFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
      uTexel: { value: new THREE.Vector2(1 / art.w, 1 / art.h) },
      uMirror: { value: 0 },
      uMode: { value: 0 },
      uGain: { value: new THREE.Vector4(1, 1, 1, 1) },
      uEdge: { value: new THREE.Vector4(0.02, 0, 0, 0) },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, blending: THREE.NoBlending });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), mat);
    this.mesh.frustumCulled = false; // placed in the vertex shader
    this.mesh.matrixAutoUpdate = false;
    this.mesh.raycast = () => {};
    this.mesh.name = 'spriteCard';
    this.mesh.userData.spriteCard = true;
  }

  /**
   * Place the card: its pivot on (x, y, z), `scale` = the card's metres per image px (the image's
   * own px per metre, foreshortened like a standing body of that height seen from this camera).
   */
  place(x, y, z, scale) {
    const a = this.art, fw = a.w / a.frames;
    const pv = a.pivot[this.frame] ?? a.pivot[0];
    const px = this.mirror ? 1 - pv[0] : pv[0];
    const u = this.uniforms;
    u.uAnchor.value.set(x, y, z);
    // (the mesh's own origin on the pivot too: the seen-through pass probes above its root's origin)
    this.mesh.position.set(x, y, z);
    this.mesh.updateMatrix();
    u.uCard.value.set(fw * scale, a.h * scale, px, pv[1]);
    u.uFrame.value.set(this.frame / a.frames, 0, 1 / a.frames, 1);
    u.uMirror.value = this.mirror ? 1 : 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class SpriteTrial {
  /** `mode`: one of SPRITE_MODES. The drawings load in the background; until they are in, the 3D actors stay drawn. */
  constructor(game, mode) {
    this.game = game;
    this.mode = null;
    this.tex = {}; // file → texture (null while loading)
    this.cards = { hero: null, wyrm: null };
    this.hidden = new Set(); // meshes whose world-pass layer this trial switched off
    this.face = { heroS: false, heroE: null, wyrmE: true }; // heroE null: not turned either way yet
    // print-mode tone (live: game.sprites.tune({...})): the drawing's linear colour x gain
    this.tone = {
      heroGain: 6, heroGlow: 1.3,
      wyrmGain: 6, wyrmGlow: 1.8, wyrmEdge: 0.03, wyrmStrokes: 1,
      rawGain: 1,
    };
    this._v = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._hideFn = (o) => this._hideOne(o);
    this.setMode(mode);
  }

  /** Is the boss slot the Cinder Wyrm (the only boss the trial redraws)? */
  get wyrmLevel() {
    const id = this.game.level?.id;
    return (id == null || id === 'cinderwood') && !!this.game.dragon?.model?.wings;
  }

  /** Switch the mode live (null / 'off': the 3D actors again, the cards gone). */
  setMode(mode) {
    const m = SPRITE_MODES.includes(mode) ? mode : null;
    if (m === this.mode) return this.mode;
    this.mode = m;
    for (const k of ['hero', 'wyrm']) {
      this.cards[k]?.dispose();
      this.cards[k] = null;
    }
    this._restore();
    const pu = this.game.pipeline?.asciiMat?.uniforms?.uSprites;
    if (pu) pu.value = 0;
    this._seen(null);
    if (m) {
      this._load('hero', m === 'glyph' ? ART.hero.glyph : ART.hero.dark);
      if (this.wyrmLevel) this._load('wyrm', m === 'glyph' ? ART.wyrm.glyph : ART.wyrm.dark);
    }
    return this.mode;
  }

  /** What the seen-through pass draws (ADR-106): the hero's print card, or (null) the 3D hero again. */
  _seen(obj) {
    const pl = this.game.pipeline, want = obj ?? this.game.player?.object3d ?? null;
    if (pl && typeof pl.setSeenThrough === 'function' && pl.seenRoot !== want) pl.setSeenThrough(want);
  }

  /** Print-mode tone, live (see `tone`). */
  tune(o = {}) {
    Object.assign(this.tone, o);
    return { ...this.tone };
  }

  _load(kind, art) {
    const want = this.mode;
    const make = (tex) => {
      if (this.mode !== want || this.cards[kind]) return;
      const card = new Card(this.game.U, tex, art);
      this.cards[kind] = card;
      this.game.scene.add(card.mesh);
    };
    const have = this.tex[art.file];
    if (have) return make(have);
    if (have === null) {
      // already loading: try again when it lands
      const wait = () => (this.tex[art.file] ? make(this.tex[art.file]) : setTimeout(wait, 100));
      return setTimeout(wait, 100);
    }
    this.tex[art.file] = null;
    new THREE.TextureLoader().load(
      ROOT + art.file,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        this.tex[art.file] = tex;
        make(tex);
      },
      undefined,
      (err) => {
        delete this.tex[art.file];
        console.warn(`[sprites] ${ROOT + art.file} did not load`, err);
      },
    );
  }

  // ------------------------------------------------------------------ hiding the 3D actors
  // A rigid-batched actor is drawn by its batch meshes and casts through its one shadow mesh; its
  // source meshes are never drawn, but the bone sync (rigidBatch.js sync, every frame) puts a batch
  // on the world layer while any of its sources has layer 0 in its (unseen) mask, and lets the
  // shadow mesh cast while any visible source has the caster bit. So layer 0 comes off the SOURCES'
  // masks (and off every unbatched mesh the camera would draw: the wing membranes): the world pass
  // no longer draws the actor, while its shadow, its bones and everything that reads the sources'
  // matrices and `visible` flags go on as before.
  _hideOne(o) {
    if (!o.isMesh || o.userData.spriteCard || o.userData.rigidBatch) return;
    if ((o.layers.mask & 1) === 0) return;
    o.layers.mask &= ~1;
    this.hidden.add(o);
  }

  _hide(root, on) {
    if (!root) return;
    if (on) root.traverse(this._hideFn);
  }

  _restore() {
    for (const o of this.hidden) o.layers.mask |= 1;
    this.hidden.clear();
  }

  // ------------------------------------------------------------------ per frame
  /** Call once a frame after the camera and the shared uniforms are final, before pipeline.render(). */
  update() {
    if (!this.mode) return;
    const g = this.game, cam = g.camera;
    const hero = this.cards.hero, wyrm = this.cards.wyrm;
    const P = g.player, D = g.dragon;
    const raw = this.mode !== 'print';
    const T = this.tone;
    const R = g.U.uCamRight.value;
    // the camera's ground-plane forward (north at the game camera)
    const m = cam.matrixWorld.elements;
    let fx = -m[8], fz = -m[10];
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;

    if (hero && P?.object3d) {
      const root = P.object3d;
      const on = root.visible !== false;
      hero.mesh.visible = on;
      if (on) {
        this._hide(root, true);
        // his facing on the ground: (sin yaw, cos yaw)
        const yaw = Number.isFinite(P.yaw) ? P.yaw : Math.PI;
        const hx = Math.sin(yaw), hz = Math.cos(yaw);
        const toward = -(hx * fx + hz * fz); // > 0: he faces the camera (south)
        const east = hx * R.x + hz * R.z; // > 0: he faces screen right
        const F = this.face;
        if (toward > HYST) F.heroS = true;
        else if (toward < -HYST) F.heroS = false;
        if (east > HYST) F.heroE = true;
        else if (east < -HYST) F.heroE = false;
        // the S figure holds the sword on the image's left, the N figure on its right: mirror so the
        // sword is on the side he turns to
        hero.frame = F.heroS ? 0 : 1;
        hero.mirror = F.heroE === null ? false : F.heroS ? F.heroE : !F.heroE;
        const p = P.position, L = P.lean;
        const ox = Number.isFinite(L?.ox) ? L.ox : 0, oz = Number.isFinite(L?.oz) ? L.oz : 0;
        hero.place(p.x + ox, p.y, p.z + oz, this._heroScale(P, hero.art.fig));
        const u = hero.uniforms;
        u.uMode.value = raw ? 0 : 1;
        const k = raw ? T.rawGain : T.heroGain;
        u.uGain.value.set(k, k, k, T.heroGlow);
        hero.mesh.updateMatrixWorld();
      }
    }
    if (wyrm && D?.object3d) {
      const root = D.object3d;
      const on = root.visible !== false;
      wyrm.mesh.visible = on;
      if (on) {
        this._hide(root, true);
        const yaw = Number.isFinite(D.yaw) ? D.yaw : 0;
        const east = Math.sin(yaw) * R.x + Math.cos(yaw) * R.z;
        const F = this.face;
        if (east > HYST) F.wyrmE = true;
        else if (east < -HYST) F.wyrmE = false;
        wyrm.frame = 0;
        wyrm.mirror = !F.wyrmE; // its head is drawn on the image's right
        const p = D.position;
        wyrm.place(p.x, p.y, p.z, this._scale(p.x, p.y + 4, p.z, wyrm.art.ppm));
        const u = wyrm.uniforms;
        u.uMode.value = raw ? 0 : 2;
        const k = raw ? T.rawGain : T.wyrmGain;
        u.uGain.value.set(k, k, k, T.wyrmGlow);
        u.uEdge.value.set(T.wyrmEdge, T.wyrmStrokes ? 1 : 0, 0, 0);
        wyrm.mesh.updateMatrixWorld();
      }
    }
    // in print the hero's card writes his art window: it prints through what covers it as he does
    this._seen(!raw && hero?.mesh.visible ? hero.mesh : null);
    // the raw modes ask the art pass to copy their pixels through
    const pu = g.pipeline?.asciiMat?.uniforms?.uSprites;
    if (pu) pu.value = raw ? 1 : 0;
  }

  /**
   * Metres per image px for a figure drawn at `ppm` px per metre whose middle is at (x, y, z): the
   * card faces the camera, so it is shrunk by how much a standing body of that height shortens
   * when seen from this camera (cos of the view's pitch there): it covers on screen what the 3D
   * body covers.
   */
  /**
   * Metres per image px of the hero's card: his figure (`figPx` image px sole to crown) spans on
   * screen what his drawn 3D body spans, standing: the crown of the 1.85 m body drawn at his size
   * and leaned away from the camera as the 3D hero is (player.leanPoint, model.js LEAN), seen
   * across the camera's plane.
   */
  _heroScale(P, figPx) {
    const p = P.position, t = this._t.set(p.x, p.y + HERO_CROWN, p.z);
    if (typeof P.leanPoint === 'function') P.leanPoint(t);
    const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
    const U = this.game.U, R = U.uCamRight.value, Up = U.uCamUp.value;
    const h = Math.hypot(dx * R.x + dy * R.y + dz * R.z, dx * Up.x + dy * Up.y + dz * Up.z);
    return Number.isFinite(h) && h > 0.1 ? h / figPx : HERO_CROWN / figPx;
  }

  _scale(x, y, z, ppm) {
    const c = this.game.camera.position, v = this._v.set(x - c.x, y - c.y, z - c.z);
    const len = v.length();
    const dy = len > 1e-6 ? v.y / len : 0;
    const k = Math.sqrt(Math.max(0.05, 1 - dy * dy));
    return Number.isFinite(k) ? k / ppm : 1 / ppm;
  }

  dispose() {
    this.setMode(null);
    for (const t of Object.values(this.tex)) t?.dispose?.();
    this.tex = {};
  }
}
