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
const TAIL_SEGS = 7;
// a tail's radius at each joint, base to tip: a plume (slim at the root, full in the middle, a fine tip)
const TAIL_R = [0.22, 0.4, 0.56, 0.64, 0.62, 0.52, 0.34, 0.1];
const NECK_LEN = 2.4;
const SINK = 13; // m under the floor it starts its rise from
// drawn taller than built (the camera looks down at 58 degrees and squashes anything upright: the
// landmarks' rule) and the head drawn larger than life (at the game camera the head IS the fox). It
// also LEANS BACK `TILT` rad (its top away from the camera, about the world's east-west axis: the camera
// is fixed, looking north): its side then faces the camera more, as the landmarks are turned to it
const TALL = 1.1, HEAD_SCALE = 2.3, TILT = 0.32;
const HEAD_LOCAL = new THREE.Vector3(0, 0.15, 0.1);
const JAW_LOCAL = new THREE.Vector3(0, -0.45, 2.75); // in front of the open jaws (head space)
const NOSE_LOCAL = new THREE.Vector3(0, 0.12, 2.5);
const EAR_LEN = 1.95;
// the head's profile (head space, x = 0 plane; ?foxSpirit=b's ink): under the skull, its back, the ear's
// back root, (the ear: ear space), its front root, the brow, the muzzle to the nose, the upper lip back to
// the hinge; then the lower jaw (jaw space): hinge, chin, under the jaw, its root
const OUTLINE_HEAD = [[0, -0.35, -0.62], [0, 0.18, -0.95], [0, 0.62, -0.66], [0, 0.86, 0.02], [0, 0.6, 0.6], [0, 0.3, 1.5], [0, 0.12, 2.5], [0, -0.12, 2.42], [0, -0.2, 1.4], [0, -0.3, 0.35]];
const OUTLINE_JAW = [[0, 0, 0], [0, -0.1, 1.9], [0, -0.34, 0.55], [0, -0.3, -0.15]];

// the art sources (render/materials.js wyrmFeatures). Charcoal-rust hide lit from below by its fire
const HIDE = {
  key: [-0.5, 0.9, 1.0], envSat: 0.3, gap: [0.12, 3.5],
  ink: [0.13, 0.1, 0.095], light: [1.0, 0.55, 1.5, 0.03], strokes: 'axis', strokeEdge: 0.3,
  vein: [1.4, 0.3, 0.05, 0.9], glow: [0.5, 0.02], vary: 0.6,
};
// the head: the same hide a step brighter where it catches the light (it stands out of the body)
const HEAD = { ...HIDE, ink: [0.16, 0.12, 0.11], light: [1.2, 0.6, 1.8, 0.04] };
// the tails: burning (their fire veins glow), the body stays dark
const TAIL = { ...HIDE, ink: [0.42, 0.15, 0.05], light: [1.0, 0.5, 1.0, 0.05], vein: [2.4, 0.55, 0.07, 0.7], glow: [0.9, 0.14] };
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
      outline: Array.from({ length: OUTLINE_HEAD.length + OUTLINE_JAW.length }, () => new THREE.Vector3()),
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
    // (its body and head: charcoal, only a little of the fire under them; the tails are the fire)
    const dimUnder = [fire.under[0], fire.under[1], fire.under[2], fire.under[3] * 0.35];
    this.mats = art
      ? { hide: mat({ ...HIDE, under: dimUnder, emit: fire.emit }, 'hide'), head: mat({ ...HEAD, under: dimUnder, emit: fire.emit }, 'head'), tail: mat({ ...TAIL, under: fire.under, emit: fire.emit }, 'tail'), eye: mat({ ...EYE, ink: fire.eye, emit: fire.eye }, 'eye'), fang: mat(FANG, 'fang'), pale: mat({ ...PALE, under: fire.under, emit: fire.emit }, 'pale') }
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

    // ---- the body: a deep chest leaning up to the shoulders, a PALE throat and breast at its front (the
    // head and the tails separate from the body by it), the haunch sunk in the fire behind
    const body = (this.body = group(root));
    burn(body, 0.82);
    const chest = add(body, ellipsoidGeometry(1.45, 1.9, 2.3, { widthSegs: 8, heightSegs: 6 }), 'hide', 0, 2.9, -0.3);
    if (chest) chest.rotation.x = -0.6;
    const breast = add(body, ellipsoidGeometry(1.05, 1.55, 1.0, { widthSegs: 8, heightSegs: 6 }), 'pale', 0, 3.2, 1.25);
    if (breast) breast.rotation.x = -0.45;
    add(body, ellipsoidGeometry(1.6, 1.5, 2.0, { widthSegs: 8, heightSegs: 6 }), 'hide', 0, 0.5, -2.8);
    // ---- the forelegs, planted (a bend at the elbow) and the paws
    this.paws = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Vector3(sx * 0.9, 3.3, 0.9), el = new THREE.Vector3(sx * 1.0, 1.6, 1.4), pw = new THREE.Vector3(sx * 0.95, 0.22, 2.2);
      for (const [a, b, r0, r1] of [[sh, el, 0.52, 0.36], [el, pw, 0.36, 0.28]]) {
        const lg = group(body, a.x, a.y, a.z);
        const dv = this._v.copy(b).sub(a), L = dv.length();
        lg.quaternion.setFromUnitVectors(Z, dv.normalize());
        add(lg, limbGeometry({ length: L, r0, r1, radial: 6, rings: 2, capSegs: 1 }), 'hide');
      }
      const paw = group(body, pw.x, pw.y, pw.z + 0.2);
      add(paw, ellipsoidGeometry(0.42, 0.26, 0.65, { widthSegs: 6, heightSegs: 4 }), 'hide');
      this.paws.push(paw);
    }
    // ---- the neck (rises up and forward from the shoulders, its front pale) and the head on it
    const neck = (this.neck = group(body, 0, 3.9, 0.9));
    burn(neck, 0.62);
    this._neckRest = -0.96; // rad about x: up and forward
    neck.rotation.order = 'YXZ';
    add(neck, limbGeometry({ length: NECK_LEN, r0: 1.0, r1: 0.8, radial: 7, rings: 2, capSegs: 1 }), 'hide');
    const throat = add(neck, ellipsoidGeometry(0.7, 0.55, 1.3, { widthSegs: 7, heightSegs: 5 }), 'pale', 0, -0.5, 1.25);
    if (throat) throat.rotation.x = 0.1;
    const head = (this.head = group(neck, 0, 0, NECK_LEN));
    head.scale.setScalar(HEAD_SCALE);
    head.rotation.order = 'XYZ'; // (pitch in the neck's frame first, then the yaw: no roll when it turns)
    // (the head's own frame is level: undo the neck's tilt so +z is the muzzle)
    this._headRest = 0.96;
    // the skull, the brow's long slope, the muzzle: one clean wedge in profile
    add(head, ellipsoidGeometry(0.82, 0.78, 0.92, { widthSegs: 8, heightSegs: 6 }), 'head', 0, 0.15, -0.05);
    const brow = add(head, hornGeometry(1.4, 0.55, { radial: 4 }), 'head', 0, 0.42, 0.1);
    if (brow) brow.scale.set(1, 0.6, 1);
    const up = add(head, hornGeometry(2.15, 0.52, { radial: 5 }), 'head', 0, 0.04, 0.4);
    if (up) {
      up.scale.set(0.95, 0.62, 1);
      up.rotation.x = 0.06;
    }
    // the lower jaw hangs from a hinge under the skull and opens WIDE (pale: it reads against the dark)
    const jaw = (this.jaw = group(head, 0, -0.3, 0.35));
    const lo = add(jaw, hornGeometry(1.9, 0.4, { radial: 4 }), 'pale', 0, -0.08, 0.0);
    if (lo) lo.scale.set(0.85, 0.45, 1);
    // the maw: the fire inside the open mouth (the white-hot glow of the eyes), a bright wedge between
    // the jaws when they part: the open mouth read at a glance
    const maw = add(head, hornGeometry(1.95, 0.4, { radial: 4 }), 'eye', 0, -0.24, 0.35);
    if (maw) maw.scale.set(0.7, 0.42, 1);
    // fangs: two long ones up front, a pair behind, and two from the lower jaw
    for (const sx of [-1, 1]) {
      for (const [z, L] of [[1.95, 0.6], [1.3, 0.4]]) {
        const f = group(head, sx * 0.22, -0.1, z);
        f.rotation.x = Math.PI / 2 + 0.15;
        add(f, hornGeometry(L, 0.1, { radial: 4 }), 'fang');
      }
      const f2 = group(jaw, sx * 0.18, 0.0, 1.5);
      f2.rotation.x = -Math.PI / 2 - 0.1;
      add(f2, hornGeometry(0.38, 0.09, { radial: 4 }), 'fang');
    }
    // ears: tall, broad, pointed, raked back (flattened side to side: their broad face to the camera),
    // pale inside
    this.ears = [];
    for (const sx of [-1, 1]) {
      const e = group(head, sx * 0.36, 0.66, -0.3);
      e.quaternion.setFromUnitVectors(Z, this._v.set(sx * 0.18, 0.95, -0.28).normalize());
      const em = add(e, hornGeometry(EAR_LEN, 0.62, { radial: 4 }), 'head');
      if (em) em.scale.set(0.5, 1.15, 1);
      const ei = add(e, hornGeometry(EAR_LEN * 0.7, 0.32, { radial: 4 }), 'pale', sx * 0.12, 0, 0.1);
      if (ei) ei.scale.set(0.4, 1.0, 1);
      this.ears.push(e);
    }
    // eye slits: long, slanted, white-hot
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const e = group(head, sx * 0.7, 0.36, 0.5);
      e.rotation.set(0.12, sx * 0.25, sx * -0.42);
      add(e, ellipsoidGeometry(0.13, 0.1, 0.48, { widthSegs: 6, heightSegs: 3 }), 'eye');
      this.eyes.push(e);
    }
    // cheek ruffs: pale spikes of fur swept back from the hinge of the jaw
    for (const sx of [-1, 1]) {
      const c = group(head, sx * 0.7, -0.22, -0.2);
      c.quaternion.setFromUnitVectors(Z, this._v.set(sx * 0.45, -0.4, -0.8).normalize());
      add(c, hornGeometry(1.25, 0.38, { radial: 4 }), 'pale');
    }
    // ---- nine tails: separate S-curved plumes from the rump, fanned up and back in the plane of its
    // profile, a gap between each; each tipped pale (and with fire: fxBeam.js spiritFire)
    const base = (this.tailBase = group(body, 0, 0.9, -3.5));
    this.tails = [];
    const L = (this.S.tails ?? 14) / TAIL_SEGS;
    this._tailL = L;
    for (let i = 0; i < TAILS; i++) {
      const f = i / (TAILS - 1); // 0 the lowest, back; 1 the highest, up over the back
      const e = (0 + 86 * f) * (Math.PI / 180), lat = (i - 4) * 0.05;
      const root0 = group(base, (i - 4) * 0.1, 0, 0);
      root0.quaternion.setFromUnitVectors(Z, this._v.set(lat, Math.sin(e), -Math.cos(e)).normalize());
      const segs = [];
      let parent = root0;
      for (let k = 0; k < TAIL_SEGS; k++) {
        const sg = group(parent, 0, 0, k === 0 ? 0 : L);
        sg.rotation.order = 'XYZ';
        add(sg, limbGeometry({ length: L, r0: TAIL_R[k], r1: TAIL_R[k + 1], radial: 6, rings: 2, capSegs: 1 }), k >= TAIL_SEGS - 1 ? 'pale' : 'tail');
        segs.push(sg);
        burn(sg, 0.5 * (1 - k / TAIL_SEGS) * (0.7 + 0.3 * ((i * 0.37) % 1)));
        parent = sg;
      }
      const tip = group(parent, 0, 0, L);
      // (the S: the first half bends one way, the second the other, alternating tail to tail)
      this.tails.push({ segs, tip, s: (i % 2 ? 1 : -1) * 0.2, ph: i * 1.31 });
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
    const nUp = 0.28 * up, nDown = 0.3 * down;
    this.neck.rotation.set(this._neckRest - nUp + nDown + 0.03 * br, turn * 0.4, 0);
    this.head.rotation.set(this._headRest + nUp - nDown - 0.55 * up + 0.85 * down, turn * 0.6, 0);
    this.jaw.rotation.set(1.15 * jaw + 0.04 * Math.sin(t * 9) * jaw, 0, 0);
    // the tails sway as flames do: an S along each (one way, then the other), a slow wave running out
    // along it, each on its own beat
    for (let i = 0; i < this.tails.length; i++) {
      const T = this.tails[i];
      for (let k = 1; k < T.segs.length; k++) {
        const w = Math.sin(t * 1.7 + T.ph - k * 0.7), w2 = Math.sin(t * 1.1 + T.ph * 1.7 - k * 0.5);
        const S = T.s * (k < T.segs.length / 2 ? 1 : -1.1);
        T.segs[k].rotation.set(S + 0.08 * w * (0.4 + k * 0.15), 0.05 * w2 * k * 0.3, 0);
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
      this.ears[i].localToWorld(P.ear[i].set(0, 0, EAR_LEN));
      this.paws[i].localToWorld(P.paw[i].set(0, 0, 0));
    }
    this.neck.localToWorld(P.neck.set(0, 0, 0));
    this.body.localToWorld(P.chest.set(0, 3.0, 0.6));
    for (let i = 0; i < this.tails.length; i++) {
      const T = this.tails[i], out = P.tails[i];
      for (let k = 0; k < T.segs.length; k++) T.segs[k].localToWorld(out[k].set(0, 0, 0));
      T.tip.localToWorld(out[T.segs.length].set(0, 0, 0));
    }
    let n = 0;
    for (const q of OUTLINE_HEAD) h.localToWorld(P.outline[n++].set(q[0], q[1], q[2]));
    for (const q of OUTLINE_JAW) j.localToWorld(P.outline[n++].set(q[0], q[1], q[2]));
    P.k = ease(this.st.rise) * (1 - this.st.fade);
  }
}

export { TAILS, TAIL_SEGS, TAIL_R };
