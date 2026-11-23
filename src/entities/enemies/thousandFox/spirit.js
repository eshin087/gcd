import * as THREE from 'three';
import { createSurfaceGlyphMaterial, FLAG } from '../../../render/materials.js';
import { limbGeometry, ellipsoidGeometry, hornGeometry } from '../../../render/glyphGeometry.js';
import { batchRigid } from '../../../render/rigidBatch.js';
import { foxLook } from './look.js';

// The Nine-Tailed Fox (Heaven-Devouring Howl, ADR-154): a creature, so a BODY in the wyrm's art path
// (FLAG.ART; CLAUDE.md "Every NEW creature"). Built once in his constructor (fox.js _setup → beam.js
// FoxHowl), hidden until summoned; no colliders, no hurt spheres, not in `breakables`; it casts no
// shadow (a spirit). Its motion is procedural (rise, rear, the jaws open, the head turning with the
// sweep, the tails swaying, going up in embers).
//
// THE SHAPE (the terrace's lesson: a fox seen from the front and above prints as a lump): its body
// always stands SIDE-ON to the camera (facing east or west, whichever the beam runs toward), so the
// game camera sees its profile: the long muzzle and the open jaws, the two tall ears, the chest and
// two planted forelegs, and nine tails fanned up and back behind it in the plane the camera faces.
// Only the head turns toward the line (TUNING.verdict.spirit.headTurn deg at most). Its rear is sunk in
// the pool of fire it rises from. ~9 m to the top of its head, a 3.5 m head, 14 m tails.
// Low-poly with flat facets (STYLE.md "The house style"): each facet one tone, a dark rust hide that
// lights where the fire under it catches it (`under`), outline strokes along the parts, two white-hot
// eye slits, pale fangs. Three materials: one draw call each (render/rigidBatch.js), none hidden.
//
// ?foxSpirit=a (default) the mesh above, wreathed in fire (fxBeam.js spiritFire); b no mesh: the same
// skeleton drawn only as fire-field heat and ink lines (fxBeam.js spiritFire draws it from points()).
// Built on a quiet Math.random (three names every object with a random uuid, and a material draws its
// seed from it): the seeded fights do not shift with the fox in the build.
//
// Surface (beam.js and fxBeam.js call these):
//   new FoxSpirit(d), reset() / hide() (hidden), visible
//   place(jx, jz, face, out)   where its root goes so its jaws hang over (jx, jz) facing `face` (yaw)
//   show(x, z, yaw)            placed (root on the ground at x, z; yaw: its body's facing), rising starts
//   frame(dt, state)           the motion: state = { rise 0..1 (out of the fire), rear -1..1 (1 the
//                              head thrown back, -1 thrust down at the line), jaw 0..1, turn rad (the
//                              head's yaw off the body's, clamped), fade 0..1 (going up in embers) }
//   jawPoint(out)              where the dark sun gathers and the beam leaves: world metres
//   P                          world points, fresh after frame(): jaw, nose, head, eye[2], ear[2],
//                              neck, chest, paw[2], tails[9][TAIL_SEGS + 1], outline[] (the head's
//                              profile), k (how much of it is there: rise x (1 - fade))
//   mode                       'a' | 'b'

const TAILS = 9;
const TAIL_SEGS = 6;
// a tail's radius at each joint, base to tip (a fox's brush: thick in the middle, a fine tip)
const TAIL_R = [0.34, 0.58, 0.72, 0.7, 0.56, 0.34, 0.08];
const NECK_LEN = 3.0;
const SINK = 13; // m under the floor it starts its rise from
// drawn taller than built (the camera looks down at 58 degrees and squashes anything upright: the
// landmarks' rule) and the head drawn larger than life (at the game camera the head is the fox)
// It also LEANS BACK `TILT` rad (its top away from the camera, about the world's east-west axis: the
// camera is fixed, looking north): its side then faces the camera, as the landmarks are turned to it
const TALL = 1.15, HEAD_SCALE = 2.0, TILT = 0.5;
const HEAD_LOCAL = new THREE.Vector3(0, 0.2, 0.2);
const JAW_LOCAL = new THREE.Vector3(0, -0.28, 3.1); // in front of the open jaws (head space)
const NOSE_LOCAL = new THREE.Vector3(0, 0.0, 2.6);
// the head's profile (head space, x = 0 plane): back of the skull, over the brow, down the muzzle to the
// nose, back along the lower jaw (jaw space for those), the throat
const OUTLINE_HEAD = [[0, 0.4, -0.95], [0, 0.95, -0.35], [0, 0.95, 0.35], [0, 0.6, 0.9], [0, 0.22, 1.9], [0, 0.0, 2.6], [0, -0.2, 2.45]];
const OUTLINE_JAW = [[0, -0.18, 2.1], [0, -0.32, 1.2], [0, -0.3, 0.2]];
const OUTLINE_TAIL = [[0, -0.6, -0.6], [0, -0.3, -1.0]]; // (head space) under the skull, to the neck

// the art sources (render/materials.js wyrmFeatures). Charcoal-rust hide lit from below by its fire
const HIDE = {
  key: [-0.5, 0.9, 1.0], envSat: 0.3, gap: [0.12, 3.5],
  ink: [0.2, 0.085, 0.055], light: [1.0, 0.5, 1.2, 0.03], strokes: 'axis', strokeEdge: 0.3,
  vein: [1.4, 0.3, 0.05, 0.9], glow: [0.5, 0.02], vary: 0.6,
};
// the head: the same hide a step brighter where it catches the light (it stands out of the body)
const HEAD = { ...HIDE, ink: [0.3, 0.13, 0.075], light: [1.15, 0.55, 1.4, 0.05] };
// the tails: burning (their fire veins glow), the body stays dark
const TAIL = { ...HIDE, ink: [0.26, 0.1, 0.05], vein: [2.4, 0.55, 0.07, 0.7], glow: [0.9, 0.12] };
// the fox's pale marks: the muzzle's underside, the cheek ruffs, the tail tips (they say fox)
const PALE = { key: [-0.5, 0.9, 1.0], envSat: 0.3, ink: [0.62, 0.55, 0.46], light: [1.0, 0.5, 0.9, 0.06], strokes: 'axis', strokeEdge: 0.3 };
const EYE = { ink: [1.0, 0.92, 0.75], light: [0.3, 0, 0, 0.12], glow: [0, 1.5] };
const FANG = { key: [-0.5, 0.9, 1.0], envSat: 0.3, ink: [0.82, 0.78, 0.7], light: [1.0, 0.6, 0.3, 0.12], strokes: 'axis', strokeEdge: 0 };
// per phase-3 fire (?foxFire3): the light from below and the glow's colour
const FIRES = {
  a: { under: [1.0, 0.3, 0.06, 0.9], emit: [1.0, 0.32, 0.06], eye: [1.0, 0.88, 0.62] },
  b: { under: [0.3, 1.0, 0.55, 0.9], emit: [0.3, 1.0, 0.55], eye: [0.85, 1.0, 0.9] },
};

const ease = (u) => u * u * (3 - 2 * u);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const Z = new THREE.Vector3(0, 0, 1);

/** Flat facets: one normal per triangle (the house style's tones), aGUV kept. */
function flat(g) {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  n.computeVertexNormals();
  return n;
}

export class FoxSpirit {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.visible = false;
    this.mode = foxLook('foxSpirit') === 'b' ? 'b' : 'a';
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    this.S = d.T?.verdict?.spirit ?? { height: 9, head: 3.5, tails: 14, headTurn: 50 };
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.P = {
      jaw: new THREE.Vector3(), nose: new THREE.Vector3(), head: new THREE.Vector3(), neck: new THREE.Vector3(), chest: new THREE.Vector3(),
      eye: [new THREE.Vector3(), new THREE.Vector3()], ear: [new THREE.Vector3(), new THREE.Vector3()], paw: [new THREE.Vector3(), new THREE.Vector3()],
      tails: Array.from({ length: TAILS }, () => Array.from({ length: TAIL_SEGS + 1 }, () => new THREE.Vector3())),
      outline: Array.from({ length: OUTLINE_HEAD.length + OUTLINE_JAW.length + OUTLINE_TAIL.length }, () => new THREE.Vector3()),
      k: 0,
    };
    this.st = { rise: 0, rear: 0, jaw: 0, turn: 0, fade: 0 };
    this.t = 0;
    const r = Math.random;
    let s = 0x5f0c9a11;
    Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    try {
      this._build();
    } finally {
      Math.random = r;
    }
    this.hide();
  }

  // ---------------------------------------------------------------- the build (once)
  _build() {
    const g = this.game, U = g.U, art = this.mode === 'a' && !!U;
    const fire = FIRES[this.d.fx?.look3 === 'b' ? 'b' : 'a'];
    const root = (this.root = new THREE.Group());
    root.name = 'nineTailedFox';
    let seed = 71.3;
    const mat = (spec, name, side = THREE.FrontSide) => {
      const m = createSurfaceGlyphMaterial(U, { flag: FLAG.ART, wyrm: spec, side, seed: (seed += 6.1), glowMask: 1, ink: spec.ink, emissive: spec.emit ?? fire.emit });
      m.name = `foxSpirit:${name}`;
      return m;
    };
    this.mats = art
      ? { hide: mat({ ...HIDE, under: fire.under, emit: fire.emit }, 'hide'), head: mat({ ...HEAD, under: fire.under, emit: fire.emit }, 'head'), tail: mat({ ...TAIL, under: fire.under, emit: fire.emit }, 'tail'), eye: mat({ ...EYE, ink: fire.eye, emit: fire.eye }, 'eye'), fang: mat(FANG, 'fang'), pale: mat({ ...PALE, under: fire.under, emit: fire.emit }, 'pale') }
      : null;
    const add = (parent, geo, m, x = 0, y = 0, z = 0) => {
      if (!art) return null;
      const o = new THREE.Mesh(flat(geo), this.mats[m]);
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    const group = (parent, x = 0, y = 0, z = 0) => {
      const o = new THREE.Group();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    // the bones whose scale goes to 0 as it goes up in embers, and when (0..1 of the fade)
    this._burn = [];
    const burn = (o, at) => this._burn.push({ o, at });

    // ---- the body: the deep chest leaning up to the shoulders, the haunch sunk in the fire behind
    const body = (this.body = group(root));
    burn(body, 0.82);
    const chest = add(body, ellipsoidGeometry(1.75, 2.15, 2.7, { widthSegs: 8, heightSegs: 6 }), 'hide', 0, 3.3, -0.3);
    if (chest) chest.rotation.x = -0.55;
    add(body, ellipsoidGeometry(1.95, 1.8, 2.5, { widthSegs: 8, heightSegs: 6 }), 'hide', 0, 0.7, -3.3);
    // the ruff at the throat: tufts thrown forward and down
    for (let i = 0; i < 3; i++) {
      const tf = group(body, (i - 1) * 0.7, 4.25 - Math.abs(i - 1) * 0.3, 1.55);
      tf.quaternion.setFromUnitVectors(Z, this._v.set((i - 1) * 0.35, -0.75, 0.6).normalize());
      add(tf, hornGeometry(1.5, 0.5, { radial: 4 }), 'hide');
    }
    // ---- the forelegs, planted (a bend at the elbow) and the paws
    this.paws = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Vector3(sx * 1.05, 3.9, 1.0), el = new THREE.Vector3(sx * 1.2, 1.9, 1.55), pw = new THREE.Vector3(sx * 1.15, 0.25, 2.5);
      for (const [a, b, r0, r1] of [[sh, el, 0.62, 0.42], [el, pw, 0.42, 0.32]]) {
        const lg = group(body, a.x, a.y, a.z);
        const dv = this._v.copy(b).sub(a), L = dv.length();
        lg.quaternion.setFromUnitVectors(Z, dv.normalize());
        add(lg, limbGeometry({ length: L, r0, r1, radial: 6, rings: 2, capSegs: 1 }), 'hide');
      }
      const paw = group(body, pw.x, pw.y, pw.z + 0.2);
      add(paw, ellipsoidGeometry(0.5, 0.3, 0.75, { widthSegs: 6, heightSegs: 4 }), 'hide');
      this.paws.push(paw);
    }
    // ---- the neck (rises up and forward from the shoulders) and the head on it
    const neck = (this.neck = group(body, 0, 4.4, 0.9));
    burn(neck, 0.62);
    this._neckRest = -1.05; // rad about x: up and forward
    neck.rotation.order = 'YXZ';
    add(neck, limbGeometry({ length: NECK_LEN, r0: 1.15, r1: 0.85, radial: 7, rings: 2, capSegs: 1 }), 'hide');
    const head = (this.head = group(neck, 0, 0, NECK_LEN));
    head.scale.setScalar(HEAD_SCALE);
    head.rotation.order = 'XYZ'; // (pitch in the neck's frame first, then the yaw: no roll when it turns)
    // (the head's own frame is level: undo the neck's tilt so +z is the muzzle)
    this._headRest = 1.05;
    add(head, ellipsoidGeometry(0.95, 0.85, 0.95, { widthSegs: 8, heightSegs: 6 }), 'head', 0, 0.2, 0);
    // the brow ridge over the eyes (the long wedge that says fox in profile)
    add(head, hornGeometry(1.3, 0.62, { radial: 4 }), 'head', 0, 0.48, 0.1);
    // the upper jaw: a long four-sided wedge, flattened
    const up = add(head, hornGeometry(2.2, 0.6, { radial: 5 }), 'head', 0, 0.06, 0.45);
    if (up) up.scale.set(1, 0.62, 1);
    // the lower jaw hangs from a hinge under the skull and opens
    const jaw = (this.jaw = group(head, 0, -0.26, 0.3));
    const lo = add(jaw, hornGeometry(1.95, 0.44, { radial: 4 }), 'pale', 0, -0.06, 0.1);
    if (lo) lo.scale.set(0.9, 0.5, 1);
    // the maw: the fire inside the open mouth (the eyes' white-hot glow): a bright wedge between the
    // dark jaws when they part, the open mouth read at a glance
    const maw = add(head, hornGeometry(2.0, 0.42, { radial: 4 }), 'eye', 0, -0.2, 0.35);
    if (maw) maw.scale.set(0.8, 0.5, 1);
    // fangs: two long ones up front, a pair behind, and two from the lower jaw
    for (const sx of [-1, 1]) {
      for (const [z, L] of [[2.05, 0.62], [1.35, 0.42]]) {
        const f = group(head, sx * 0.24, -0.08, z);
        f.rotation.x = Math.PI / 2 + 0.15;
        add(f, hornGeometry(L, 0.11, { radial: 4 }), 'fang');
      }
      const f2 = group(jaw, sx * 0.2, 0.0, 1.6);
      f2.rotation.x = -Math.PI / 2 - 0.1;
      add(f2, hornGeometry(0.4, 0.1, { radial: 4 }), 'fang');
    }
    // ears: tall, pointed, raked back and out
    this.ears = [];
    for (const sx of [-1, 1]) {
      const e = group(head, sx * 0.48, 0.78, -0.25);
      e.quaternion.setFromUnitVectors(Z, this._v.set(sx * 0.32, 0.92, -0.32).normalize());
      add(e, hornGeometry(1.75, 0.5, { radial: 4 }), 'head');
      this.ears.push(e);
    }
    // eye slits: thin, slanted, white-hot
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const e = group(head, sx * 0.74, 0.4, 0.58);
      e.rotation.set(0.1, sx * 0.25, sx * -0.38);
      add(e, ellipsoidGeometry(0.1, 0.07, 0.42, { widthSegs: 6, heightSegs: 3 }), 'eye');
      this.eyes.push(e);
    }
    // cheek ruffs: spikes of fur swept back from the jaw's hinge
    for (const sx of [-1, 1]) {
      const c = group(head, sx * 0.78, -0.18, -0.15);
      c.quaternion.setFromUnitVectors(Z, this._v.set(sx * 0.5, -0.35, -0.8).normalize());
      add(c, hornGeometry(1.4, 0.4, { radial: 4 }), 'pale');
    }
    // ---- nine tails: chains from the rump, fanned up and back in its profile's plane
    const base = (this.tailBase = group(body, 0, 1.0, -4.2));
    this.tails = [];
    const L = (this.S.tails ?? 14) / TAIL_SEGS;
    this._tailL = L;
    for (let i = 0; i < TAILS; i++) {
      const f = i / (TAILS - 1); // 0 the lowest, back; 1 the highest, up over the back
      const e = (6 + 62 * f) * (Math.PI / 180), lat = (i % 2 ? 1 : -1) * (0.08 + 0.05 * Math.abs(i - 4));
      const root0 = group(base, (i - 4) * 0.12, 0, 0);
      root0.quaternion.setFromUnitVectors(Z, this._v.set(lat, Math.sin(e), -Math.cos(e)).normalize());
      const segs = [];
      let parent = root0;
      for (let k = 0; k < TAIL_SEGS; k++) {
        const sg = group(parent, 0, 0, k === 0 ? 0 : L);
        sg.rotation.order = 'XYZ';
        add(sg, limbGeometry({ length: L, r0: TAIL_R[k], r1: TAIL_R[k + 1], radial: 6, rings: 2, capSegs: 1 }), k === TAIL_SEGS - 1 ? 'pale' : 'tail');
        segs.push(sg);
        burn(sg, 0.5 * (1 - k / TAIL_SEGS) * (0.7 + 0.3 * ((i * 0.37) % 1)));
        parent = sg;
      }
      const tip = group(parent, 0, 0, L);
      // (the curl: tips flare out from the fan's middle, like flames)
      this.tails.push({ segs, tip, curl: (f - 0.45) * 0.16, ph: i * 1.31 });
    }
    root.scale.set(1, TALL, 1);
    root.rotation.order = 'XYZ';
    root.visible = false;
    g.scene?.add?.(root);
    root.updateMatrixWorld(true);
    // one draw call per material; a spirit casts no shadow (not markCaster)
    this.batch = art ? batchRigid(U, root) : null;
    // the jaws' offset from the root at rest (place())
    this._pose(0, 0, 0, 0, 0);
    root.updateMatrixWorld(true);
    this.head.localToWorld(this._v.copy(JAW_LOCAL));
    this._jawRest = { fwd: this._v.z, up: this._v.y };
  }

  // ---------------------------------------------------------------- the surface
  reset() {
    this.hide();
    this.st.rise = this.st.rear = this.st.jaw = this.st.turn = this.st.fade = 0;
  }

  hide() {
    this.visible = false;
    if (this.root) this.root.visible = false;
    this.P.k = 0;
  }

  /** Root position for jaws over (jx, jz) with the body facing `face` (yaw): into `out` { x, z }. */
  place(jx, jz, face, out) {
    // (its rest jaws: `fwd` along its facing, `up` high; the lean carries them north by up x sin(TILT))
    const f = this._jawRest?.fwd ?? 5, u = this._jawRest?.up ?? 8;
    out.x = jx - Math.sin(face) * f;
    out.z = jz - (Math.cos(face) * f * Math.cos(TILT) - u * Math.sin(TILT));
    return out;
  }

  show(x, z, yaw) {
    this.visible = true;
    this.x = fin(x);
    this.z = fin(z);
    this.yaw = fin(yaw);
    if (this.root) this.root.visible = true;
  }

  /** The motion this frame (see the header). Never throws: a bad state draws nothing. */
  frame(dt, state) {
    if (!this.visible || !this.root) return;
    const S = this.st;
    if (state) {
      S.rise = clamp01(fin(state.rise));
      S.rear = Math.max(-1, Math.min(1, fin(state.rear)));
      S.jaw = clamp01(fin(state.jaw));
      const lim = ((this.S.headTurn ?? 50) * Math.PI) / 180;
      S.turn = Math.max(-lim, Math.min(lim, fin(state.turn)));
      S.fade = clamp01(fin(state.fade));
    }
    this.t += Math.max(0, fin(dt));
    const R = this.root;
    R.position.set(this.x, -SINK * (1 - ease(S.rise)), this.z);
    R.rotation.set(-TILT, this.yaw, 0); // (order XYZ: the yaw first, then the lean about east-west)
    this._pose(S.rear, S.jaw, S.turn, S.fade, this.t);
    R.updateMatrixWorld(true);
    this._points();
    // the fire in it: the tails' veins and the eyes glow (materials.js uGlow), brighter as it charges
    const M = this.mats;
    if (M) {
      const k = (1 - S.fade) * (0.6 + 0.4 * S.jaw), fl = 0.85 + 0.15 * Math.sin(this.t * 7.3);
      M.hide.uniforms.uGlow.value = 0.45 * k;
      M.head.uniforms.uGlow.value = 0.45 * k;
      M.tail.uniforms.uGlow.value = 1.0 * k * fl;
      M.pale.uniforms.uGlow.value = 0.3 * k;
      M.eye.uniforms.uGlow.value = 1.0;
    }
    if (S.fade >= 1) this.hide();
  }

  jawPoint(out) {
    if (!this.root) return out.set(this.x, 6, this.z);
    return this.head.localToWorld(out.copy(JAW_LOCAL));
  }

  // ---------------------------------------------------------------- the motion
  _pose(rear, jaw, turn, fade, t) {
    // breath: the chest heaves; the neck rears back (rear > 0) or thrusts the head down at the line
    const br = Math.sin(t * 2.1);
    this.body.scale.set(1, 1 + 0.015 * br, 1);
    const up = Math.max(0, rear), down = Math.max(0, -rear);
    // (neck: up straightens it, down leans it forward; the head undoes that and adds its own pitch:
    // reared, the muzzle up 0.55 rad; thrust, down 0.85 rad at the line under it)
    const nUp = 0.32 * up, nDown = 0.35 * down;
    this.neck.rotation.set(this._neckRest - nUp + nDown + 0.03 * br, turn * 0.4, 0);
    this.head.rotation.set(this._headRest + nUp - nDown - 0.55 * up + 0.85 * down, turn * 0.6, 0);
    this.jaw.rotation.set(1.0 * jaw + 0.04 * Math.sin(t * 9) * jaw, 0, 0);
    for (let i = 0; i < 2; i++) this.ears[i].rotation.z = (i ? 1 : -1) * 0.08 * Math.sin(t * 1.3 + i);
    // the tails sway as flames do: a slow wave running out along each, each on its own beat
    for (let i = 0; i < this.tails.length; i++) {
      const T = this.tails[i];
      for (let k = 0; k < T.segs.length; k++) {
        const w = Math.sin(t * 1.7 + T.ph - k * 0.7), w2 = Math.sin(t * 1.1 + T.ph * 1.7 - k * 0.5);
        T.segs[k].rotation.set(k === 0 ? 0 : T.curl * k * -0.6 + 0.1 * w * (0.4 + k * 0.15), k === 0 ? 0 : 0.06 * w2 * k * 0.4, 0);
      }
    }
    // going up in embers: the tails' tips first, then the head, the body last
    for (const B of this._burn) {
      const s = fade > 0 ? 1 - clamp01((fade - B.at * 0.85) / 0.18) : 1;
      B.o.scale.setScalar(Math.max(1e-3, s));
      B.o.visible = s > 0.002;
    }
    if (fade <= 0) this.body.scale.set(1, 1 + 0.015 * br, 1);
  }

  /** The world points beam.js and fxBeam.js read (fresh after frame()). */
  _points() {
    const P = this.P, h = this.head, j = this.jaw;
    h.localToWorld(P.jaw.copy(JAW_LOCAL));
    h.localToWorld(P.nose.copy(NOSE_LOCAL));
    h.localToWorld(P.head.copy(HEAD_LOCAL));
    for (let i = 0; i < 2; i++) {
      this.eyes[i].localToWorld(P.eye[i].set(0, 0, 0));
      this.ears[i].localToWorld(P.ear[i].set(0, 0, 1.75));
      this.paws[i].localToWorld(P.paw[i].set(0, 0, 0));
    }
    this.neck.localToWorld(P.neck.set(0, 0, 0));
    this.body.localToWorld(P.chest.set(0, 3.3, 0.6));
    for (let i = 0; i < this.tails.length; i++) {
      const T = this.tails[i], out = P.tails[i];
      for (let k = 0; k < T.segs.length; k++) T.segs[k].localToWorld(out[k].set(0, 0, 0));
      T.tip.localToWorld(out[T.segs.length].set(0, 0, 0));
    }
    let n = 0;
    for (const q of OUTLINE_HEAD) h.localToWorld(P.outline[n++].set(q[0], q[1], q[2]));
    for (const q of OUTLINE_JAW) j.localToWorld(P.outline[n++].set(q[0], q[1], q[2]));
    for (const q of OUTLINE_TAIL) h.localToWorld(P.outline[n++].set(q[0], q[1], q[2]));
    P.k = ease(this.st.rise) * (1 - this.st.fade);
  }
}

export { TAILS, TAIL_SEGS, TAIL_R };
