import * as THREE from 'three';
import { DIM } from '../../player/model.js';
import { solveTwoBone } from '../../player/anim.js';
import { REACT } from './reactTuning.js';

// THE BODY ANSWERS WHERE IT WAS HIT (the impact pass's `react`, combat/impact.js; numbers:
// reactTuning.js). A struck duelist's head snaps along the blade's travel, his torso twists about the
// spine with the cut (a thrust folds him round the point), a struck leg buckles and he drops on that
// side. It is a DRAWN layer, like the shudder: duelist._animate poses the upright body (his hurt
// spheres and every gameplay point come from it), then this turns his joints on top of it for the
// frame that is drawn, and takes the turn off again before the animator runs next frame. So the hit
// stun, the shove, his guard, his move's clock and where his blows land never see it.
//
//   hit(o)       a landed cut (duelist.takeHit / onExecute): opens a slot; the snap shows in the
//                hit's own tick (the frame the hit-stop holds), the rest plays on game time after it
//   restore()    before the animator runs: the joints this layer turned last frame back as they were
//   apply(dt)    after the gameplay points (lean off: model space): the slots' sum on the joints
//   reset()
// Rotations are summed as rotation vectors in his ROOT frame (+x his left, +y up, +z the way he faces)
// and put on each joint about its own pivot. The joints turned: body (the waist pivot: moved and
// rolled), pelvis, spine, head; the legs are solved again to the feet where they stood (a dropped hip
// bends the knees, the soles stay planted), and what hangs in body space (the sword, the Starless
// Lord's off-hand blade) is carried with the chest, so a hand never lets go of its hilt.
// Its jitter (the skid's dust) draws from its own stream: never Math.random, never the FX's.
// No allocation per frame; nothing here makes a THREE object (scratch vectors only).

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

/** The reaction's share of its peak at game time `a` since the hit: `s0` at once (the snap), the peak
 *  after `rise` (eased in and out), back to rest over `back`. 0 before 0 (a lagging joint) and after the end. */
export function reactEnv(a, s0, rise, back) {
  if (!(a >= 0)) return 0;
  if (a < rise) {
    const u = a / rise; // (smooth both ends: the release out of the freeze is a swing, not a jump)
    return s0 + (1 - s0) * u * u * (3 - 2 * u);
  }
  const u = (a - rise) / back;
  if (u >= 1) return 0;
  return 1 - u * u * (3 - 2 * u);
}

// scratch (module level: one duelist poses at a time)
const _qR = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _qI = new THREE.Quaternion(), _qJ = new THREE.Quaternion();
const _ax = new THREE.Vector3(), _v = new THREE.Vector3(), _S = new THREE.Vector3(), _T = new THREE.Vector3(), _pole = new THREE.Vector3(), _end = new THREE.Vector3();
const _mOld = new THREE.Matrix4(), _mNew = new THREE.Matrix4(), _mD = new THREE.Matrix4();
const ACC = { b: [0, 0, 0], p: [0, 0, 0], s: [0, 0, 0], h: [0, 0, 0], t: [0, 0, 0] };
const NO_LEGS = [];
const KEYS = ['b', 'p', 'pl', 's', 'h', 't'];

const slot = () => ({ on: false, fresh: false, age: 0, s0: 0.4, rise: 0.07, back: 0.3, lag: 0, b: [0, 0, 0], p: [0, 0, 0], pl: [0, 0, 0], s: [0, 0, 0], h: [0, 0, 0], t: [0, 0, 0] });
const xf = () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1) });

export class HitReact {
  constructor(d) {
    this.d = d;
    this.slots = Array.from({ length: REACT.slots }, slot);
    this.live = false; // a slot is on
    this.turned = false; // the joints carry this layer now (restore() takes it off)
    this._seed = 0x6d2b79f5;
    // what apply() changed, as it was (restore)
    this._save = { body: xf(), pelvis: new THREE.Quaternion(), spine: new THREE.Quaternion(), head: new THREE.Quaternion(), legs: [0, 1].map(() => ({ thigh: new THREE.Quaternion(), shin: new THREE.Quaternion(), foot: new THREE.Quaternion() })), kids: [], kidSave: [] };
    this._footW = [new THREE.Vector3(), new THREE.Vector3()];
    this._kneeW = [new THREE.Vector3(), new THREE.Vector3()];
    this._footQ = [new THREE.Quaternion(), new THREE.Quaternion()];
    this.last = null; // the last hit as read (the tests, the Lab): { part, side, thrust, K }
    // CONTACT's reach (combat/contact.js `b`; duelist._reachStep): his body shifted toward the hero, root
    // frame, model m, on top of the slots (its own cap, set every frame)
    this.reach = [0, 0, 0];
  }

  /** CONTACT's reach this frame (root frame: +x his left, +z the way he faces; model m). */
  setReach(x, y, z) {
    const r = this.reach;
    r[0] = Number.isFinite(x) ? x : 0;
    r[1] = Number.isFinite(y) ? y : 0;
    r[2] = Number.isFinite(z) ? z : 0;
  }
  get reaching() {
    const r = this.reach;
    return r[0] !== 0 || r[1] !== 0 || r[2] !== 0;
  }

  _rnd() {
    this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }
  _rand(a, b) {
    return a + this._rnd() * (b - a);
  }

  reset() {
    this.restore();
    for (const s of this.slots) s.on = false;
    this.live = false;
    this.last = null;
  }

  /** Is the layer moving him (a slot on)? */
  get active() {
    return this.live || this.reaching;
  }

  /**
   * A landed cut. o: { k (impactK('react') > 0), part ('head' | 'body' | 'leg'), point (the DRAWN
   * contact, world, after the shove; null: his chest), cut {x, z} (the blade's travel, world, unit),
   * dir {x, z} (the shove's, unit), thrust (1: the blow is a thrust; NaN: read it from the cut),
   * heavy, crit, reel, skid (m he was shoved: a heavy blow skids his feet), moved {x, z} (the shove
   * this tick: the feet's dust starts where they are drawn after it) }. A fourth hit while three
   * are on replaces the faintest.
   */
  hit(o) {
    const d = this.d, R = REACT;
    const k = fin(o.k, 0);
    if (!(k > 0)) return false;
    const kit = R.kits[d.kit?.id] ?? null;
    const heavy = !!o.heavy;
    const K = k * fin(kit?.k, 1) * (heavy ? R.heavyK : 1) * (o.crit ? R.critK : 1) * (o.reel > 0 && !heavy ? R.reelK : 1);
    if (!(K > 0)) return false;
    // into his root frame (+x his left, +z the way he faces)
    const yaw = fin(d.yaw), cy = Math.cos(yaw), sy = Math.sin(yaw);
    const toLx = (x, z) => x * cy - z * sy, toLz = (x, z) => x * sy + z * cy;
    let fx = fin(o.dir?.x, NaN), fz = fin(o.dir?.z, NaN);
    if (!Number.isFinite(fx + fz) || fx * fx + fz * fz < 1e-6) {
      fx = 0;
      fz = -1;
    } else {
      const l = Math.hypot(fx, fz), wx = fx / l, wz = fz / l;
      fx = toLx(wx, wz);
      fz = toLz(wx, wz);
    }
    let cx = fin(o.cut?.x, NaN), cz = fin(o.cut?.z, NaN);
    if (!Number.isFinite(cx + cz) || cx * cx + cz * cz < 1e-6) {
      cx = fx;
      cz = fz;
    } else {
      const l = Math.hypot(cx, cz), wx = cx / l, wz = cz / l;
      cx = toLx(wx, wz);
      cz = toLz(wx, wz);
    }
    // the contact on the UPRIGHT body (the lean and the drawn size taken off), root frame
    const pos = d.position, L = d.lean, S = d.drawScale > 0 ? d.drawScale : 1, pt = o.point;
    let ux = 0, uy = 1.35, uz = 0.1;
    if (pt && Number.isFinite(pt.x + pt.y + pt.z)) {
      const yd = pt.y - pos.y;
      const wx = (pt.x - pos.x - fin(L?.k) * fin(L?.dx) * yd - fin(L?.ox)) / S, wz = (pt.z - pos.z - fin(L?.k) * fin(L?.dz) * yd - fin(L?.oz)) / S;
      ux = toLx(wx, wz);
      uz = toLz(wx, wz);
      uy = yd / S;
    }
    // where the body answers: the struck part, read with the DRAWN contact's height (the cut is seen
    // there: a gameplay 'leg' hit drawn on the hips twists the hips, and buckles that knee a little)
    const gp = o.part === 'head' || o.part === 'leg' ? o.part : 'body', Z = R.zones;
    let part = uy > Z.head || (gp === 'head' && uy > Z.headPart) ? 'head' : uy < Z.leg || (gp === 'leg' && uy < Z.legPart) ? 'leg' : 'body';
    // (CONTACT, combat/contact.js: the struck capsule when the blow could say: o.limb 'head' | 'body' |
    // 'armR' | 'armL' | 'legR' | 'legL'. An arm knocks that shoulder back)
    const limb = typeof o.limb === 'string' ? o.limb : '';
    if (limb) part = limb.startsWith('arm') ? 'arm' : limb.startsWith('leg') ? 'leg' : limb === 'head' ? 'head' : 'body';
    const legMix = gp === 'leg' && part === 'body' && !limb ? Z.legMix : 0;
    // a thrust: the hero's attack says so (o.thrust 0..1); else the blade running along the push (a
    // falling cut's ground travel runs along it too, so the measure is kept strict)
    const tau = Number.isFinite(o.thrust) ? clamp(o.thrust, 0, 1) : smooth(R.thrust[0], R.thrust[1], cx * fx + cz * fz);
    // a slot: a free one, else the faintest
    let s = this.slots.find((q) => !q.on);
    if (!s) {
      let lo = Infinity;
      for (const q of this.slots) {
        const e = reactEnv(q.age, q.s0, q.rise, q.back);
        if (e < lo) {
          lo = e;
          s = q;
        }
      }
    }
    for (const key of KEYS) s[key][0] = s[key][1] = s[key][2] = 0;
    s.on = true;
    s.fresh = true; // the hit's own tick has already run its clock: the first apply holds the snap
    s.age = 0;
    s.rise = heavy ? R.heavyRise : R.rise;
    s.back = heavy ? R.heavyBack : R.back;
    s.lag = 0;
    s.s0 = R.snap;
    const add = (v, x, y, z, w) => {
      v[0] += x * w;
      v[1] += y * w;
      v[2] += z * w;
    };
    let side = 0;
    if (part === 'head') {
      // knocked along the blade's travel (a thrust: back along the push); the top of the head goes
      // that way (about up x b), the face turns with a sideways cut, the shoulders follow a little
      let bx = cx * (1 - tau) + fx * tau, bz = cz * (1 - tau) + fz * tau;
      const bl = Math.hypot(bx, bz);
      if (bl > 1e-4) {
        bx /= bl;
        bz /= bl;
      } else {
        bx = fx;
        bz = fz;
      }
      const H = R.head;
      add(s.h, bz * H.tilt, bx * H.yaw, -bx * H.tilt, K);
      add(s.s, bz * H.neck, bx * H.neckYaw, -bx * H.neck, K);
      add(s.t, bx * H.shift, 0, bz * H.shift, K);
      side = Math.sign(ux) || 1;
    } else if (part === 'body' || part === 'arm') {
      const B = R.body, AR = part === 'arm' ? R.arm : null;
      // the blow's push: into him (the struck shoulder goes back), and some of the blade's travel
      // across him (the other comes round)
      const Fx = fx + B.cut * cx, Fz = fz + B.cut * cz, Fl = Math.hypot(Fx, Fz) || 1;
      // the contact off the spine (bounded), the twist it makes (torque about up)
      let rx = ux, rz = uz;
      const rl = Math.hypot(rx, rz), rmax = B.arm * 1.5;
      if (rl > rmax) {
        rx *= rmax / rl;
        rz *= rmax / rl;
      }
      const tq = clamp((rz * Fx - rx * Fz) / B.arm, -1, 1) * (1 - 0.6 * tau);
      const hi = AR ? 1 : smooth(Z.low, Z.high, uy); // the chest (1) or the belly / hips (0); an arm: the chest
      const tw = B.twist * tq * K * (AR ? AR.twist : 1);
      const low = B.low * (1 - hi);
      add(s.s, 0, tw * (1 - low), 0, 1);
      add(s.p, 0, tw * low, 0, 1);
      add(s.pl, 0, tw * B.hips, 0, 1);
      s.lag = R.hipLag;
      // the chest leans with the blow's sideways part (the jolt already throws it back), the body gives
      // a little along it (not for a thrust: it folds)
      const nx = Fx / Fl, nz = Fz / Fl, open = 1 - tau;
      add(s.s, 0, 0, -nx * B.lean, K * (0.5 + 0.5 * hi) * open);
      add(s.t, nx * B.shift, 0, nz * B.shift, K * (1 - 0.5 * hi) * open);
      if (tau > 0) {
        // a thrust: he folds round the point, hips back along the push, the chest over the blade
        // (its top toward the hero: about up x -f), the head up to keep his eyes on him
        const F = B.fold, w = tau * K;
        add(s.s, -fz * F.chest, 0, fx * F.chest, w);
        add(s.p, -fz * F.pelvis, 0, fx * F.pelvis, w);
        add(s.h, fz * F.head, 0, -fx * F.head, w);
        add(s.t, fx * F.hips, -F.drop, fz * F.hips, w);
      }
      side = Math.sign(ux) || 1;
      if (AR) {
        // an arm: that shoulder dropped and driven back (the chest rolls onto it), the head turned from it
        const sd = limb.endsWith('L') ? 1 : limb.endsWith('R') ? -1 : side;
        side = sd;
        add(s.s, AR.pitch, 0, -sd * AR.roll, K);
        add(s.h, 0, -sd * AR.head, 0, K);
      }
    }
    if (part === 'leg' || legMix > 0) {
      // a leg: the hips roll down onto the struck side (about his forward axis), the chest takes most
      // of it back, he tips over the bent knee and sinks; the legs are solved again (apply), so the
      // knees bend with the drop and the feet stay where they stood
      const G = R.leg, w = K * (part === 'leg' ? 1 : legMix);
      side = limb === 'legL' ? 1 : limb === 'legR' ? -1 : ux >= 0 ? 1 : -1; // +1 his left
      add(s.b, G.pitch, 0, -side * G.roll, w);
      add(s.s, 0, 0, side * G.roll * G.catch, w);
      add(s.t, side * G.shift + cx * 0.01, -G.drop, cz * 0.01, w);
    }
    // the freeze holds the snap: the struck surface may move at most snapM m off the drawn contact
    // there. Its reach at the peak (each joint's turn x its distance to the contact, the shift) sets
    // the share the freeze shows
    const reach = this._reach(s, pt, S);
    if (reach > 0) s.s0 = Math.min(R.snap, R.snapM / reach);
    this.live = true;
    this.last = { part, gamePart: gp, legMix, side, thrust: tau, K, height: uy };
    // a heavy blow that shoved him: his feet skid, a little dust at each
    if (heavy && fin(o.skid, 0) > 0.05 && kit?.dust) this._dust(o, kit.dust);
    return true;
  }

  /** How far the contact point moves at the slot's peak (drawn metres, an upper bound): each turned
   *  joint's angle x its distance to the contact (as drawn last frame), the body's shift. */
  _reach(s, pt, S) {
    const r = this.d.rig;
    if (!r?.body || !pt || !Number.isFinite(pt.x + pt.y + pt.z)) return Math.hypot(s.t[0], s.t[1], s.t[2]) * S;
    const arm = (j) => {
      _v.setFromMatrixPosition(j.matrixWorld);
      const l = Math.hypot(pt.x - _v.x, pt.y - _v.y, pt.z - _v.z);
      return Number.isFinite(l) ? l : 1;
    };
    const mag = (v) => Math.hypot(v[0], v[1], v[2]);
    return mag(s.b) * arm(r.body) + mag(s.p) * arm(r.pelvis) + mag(s.s) * arm(r.spine) + mag(s.h) * arm(r.head) + mag(s.t) * S;
  }

  /** The skid's dust: a few small grit letters kicked up at each foot, along the shove. */
  _dust(o, col) {
    const d = this.d, fx = d.fx, D = REACT.dust, r = d.rig;
    if (!fx?._rec || !fx.alpha || !r?.legs) return;
    const wx = fin(o.dir?.x), wz = fin(o.dir?.z), mx = fin(o.moved?.x), mz = fin(o.moved?.z);
    for (const leg of this._legsOf(r)) {
      _v.setFromMatrixPosition(leg.foot.matrixWorld);
      if (!Number.isFinite(_v.x + _v.z)) continue;
      for (let i = 0; i < D.perFoot; i++) {
        const a = this._rand(-1.1, 1.1), sp = this._rand(D.speed[0], D.speed[1]), ca = Math.cos(a), sa = Math.sin(a);
        const q = fx._rec(_v.x + mx + this._rand(-0.08, 0.08), this._rand(0.03, 0.1), _v.z + mz + this._rand(-0.08, 0.08), this._rand(D.life[0], D.life[1]), this._rand(D.size[0], D.size[1]), 0.06, D.glyphs, col[0], col[1]);
        // (along the shove, fanned ±60°: the soles plough the floor the way he is driven)
        q.vx = (wx * ca - wz * sa) * sp;
        q.vz = (wx * sa + wz * ca) * sp;
        q.vy = this._rand(D.up[0], D.up[1]);
        q.drag = 3;
        q.gravity = -3;
        q.alpha = this._rand(0.55, 0.85);
        q.spin = this._rand(-2, 2);
        fx._spawn(fx.alpha, q);
      }
    }
  }

  /** [right, left] legs of the rig (made once). */
  _legsOf(r) {
    if (!r?.legs?.R || !r.legs.L) return null;
    if (this._legs?.[0] !== r.legs.R) this._legs = [r.legs.R, r.legs.L];
    return this._legs;
  }

  /** The joints apply() turned last frame, back as they were (before the animator runs). */
  restore() {
    if (!this.turned) return;
    this.turned = false;
    const r = this.d.rig, V = this._save;
    r.body.position.copy(V.body.p);
    r.body.quaternion.copy(V.body.q);
    r.pelvis.quaternion.copy(V.pelvis);
    r.spine.quaternion.copy(V.spine);
    r.head.quaternion.copy(V.head);
    const legs = this._legsOf(r) ?? NO_LEGS;
    for (let i = 0; i < legs.length; i++) {
      legs[i].thigh.quaternion.copy(V.legs[i].thigh);
      legs[i].shin.quaternion.copy(V.legs[i].shin);
      legs[i].foot.quaternion.copy(V.legs[i].foot);
    }
    for (let i = 0; i < V.kids.length; i++) {
      const c = V.kids[i], k = V.kidSave[i];
      if (!c) continue;
      c.position.copy(k.p);
      c.quaternion.copy(k.q);
      c.scale.copy(k.s);
    }
    V.kids.length = 0;
  }

  /** The slots' sum on the joints (lean off: the upright model). dt: game time (the freeze holds it). */
  apply(dt) {
    if (!this.live && !this.reaching) return;
    const R = REACT;
    const A = ACC;
    A.b[0] = A.b[1] = A.b[2] = A.p[0] = A.p[1] = A.p[2] = A.s[0] = A.s[1] = A.s[2] = A.h[0] = A.h[1] = A.h[2] = A.t[0] = A.t[1] = A.t[2] = 0;
    let any = false;
    const step = fin(dt, 0) > 0 ? dt : 0;
    for (const s of this.slots) {
      if (!s.on) continue;
      if (step > 0) {
        if (s.fresh) s.fresh = false;
        else s.age += step;
      }
      if (s.age > s.rise + s.back + s.lag) {
        s.on = false;
        continue;
      }
      any = true;
      const e = reactEnv(s.age, s.s0, s.rise, s.back), el = reactEnv(s.age - s.lag, 0, s.rise, s.back);
      for (let i = 0; i < 3; i++) {
        A.b[i] += s.b[i] * e;
        A.p[i] += s.p[i] * e + s.pl[i] * el;
        A.s[i] += s.s[i] * e;
        A.h[i] += s.h[i] * e;
        A.t[i] += s.t[i] * e;
      }
    }
    if (!any) this.live = false;
    if (!any && !this.reaching) return;
    const cap = (v, m) => {
      const l = Math.hypot(v[0], v[1], v[2]);
      if (!(l <= m)) {
        const f = Number.isFinite(l) && l > 0 ? m / l : 0;
        v[0] *= f;
        v[1] *= f;
        v[2] *= f;
      }
    };
    cap(A.b, R.maxAngle);
    cap(A.p, R.maxAngle);
    cap(A.s, R.maxAngle);
    cap(A.h, R.maxAngle);
    cap(A.t, R.maxShift);
    A.t[0] += this.reach[0];
    A.t[1] += this.reach[1];
    A.t[2] += this.reach[2];
    this._pose(A);
  }

  _pose(A) {
    const r = this.d.rig, V = this._save;
    if (!r?.body || !r.pelvis || !r.spine || !r.head || !r.chest) return;
    const legs = this._legsOf(r);
    // as it was (restore), and where the feet stand now (world: the root's matrix is the plain one)
    V.body.p.copy(r.body.position);
    V.body.q.copy(r.body.quaternion);
    V.pelvis.copy(r.pelvis.quaternion);
    V.spine.copy(r.spine.quaternion);
    V.head.copy(r.head.quaternion);
    if (legs) {
      for (let i = 0; i < 2; i++) {
        V.legs[i].thigh.copy(legs[i].thigh.quaternion);
        V.legs[i].shin.copy(legs[i].shin.quaternion);
        V.legs[i].foot.copy(legs[i].foot.quaternion);
        legs[i].foot.updateWorldMatrix(true, false);
        this._footW[i].setFromMatrixPosition(legs[i].foot.matrixWorld);
        this._kneeW[i].setFromMatrixPosition(legs[i].shin.matrixWorld);
        legs[i].foot.matrixWorld.decompose(_v, this._footQ[i], _S);
      }
    }
    // the chest in body space before (what hangs in body space is carried with it)
    r.pelvis.updateMatrix();
    r.spine.updateMatrix();
    r.chest.updateMatrix();
    _mOld.multiplyMatrices(r.pelvis.matrix, r.spine.matrix).multiply(r.chest.matrix);
    this.turned = true;
    // the body: moved, then turned about the waist pivot (its parent is the root: root frame as is)
    r.body.position.x += A.t[0];
    r.body.position.y += A.t[1];
    r.body.position.z += A.t[2];
    this._turn(r.body, null, A.b);
    // each joint turned about a root-frame axis: q = P^-1 R P q (P: its parent's turn in the root)
    _qP.copy(r.body.quaternion);
    this._turn(r.pelvis, _qP, A.p);
    _qP.multiply(r.pelvis.quaternion);
    this._turn(r.spine, _qP, A.s);
    _qP.multiply(r.spine.quaternion).multiply(r.chest.quaternion);
    this._turn(r.head, _qP, A.h);
    // what hangs in body space (the sword, an off-hand blade), carried with the chest
    r.pelvis.updateMatrix();
    r.spine.updateMatrix();
    _mNew.multiplyMatrices(r.pelvis.matrix, r.spine.matrix).multiply(r.chest.matrix);
    _mD.copy(_mOld).invert().premultiply(_mNew);
    V.kids.length = 0;
    const ch = r.body.children;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (c === r.pelvis || !c.visible) continue;
      const n = V.kids.length;
      if (!V.kidSave[n]) V.kidSave[n] = xf(); // (grows to the number of carried parts once)
      const k = V.kidSave[n];
      k.p.copy(c.position);
      k.q.copy(c.quaternion);
      k.s.copy(c.scale);
      V.kids.push(c);
      c.updateMatrix();
      c.matrix.premultiply(_mD);
      c.matrix.decompose(c.position, c.quaternion, c.scale);
    }
    // the legs solved again to the feet where they stood
    if (legs) {
      r.pelvis.updateWorldMatrix(true, false);
      r.pelvis.getWorldQuaternion(_qI);
      for (let i = 0; i < 2; i++) {
        const lg = legs[i];
        _S.copy(lg.thigh.position);
        _T.copy(this._footW[i]);
        r.pelvis.worldToLocal(_T);
        _pole.copy(this._kneeW[i]);
        r.pelvis.worldToLocal(_pole).sub(_S);
        if (!Number.isFinite(_T.x + _T.y + _T.z + _pole.x + _pole.y + _pole.z)) continue;
        _qJ.copy(lg.thigh.quaternion);
        const beta = solveTwoBone(_S, _T, _pole, DIM.thigh, DIM.shin, -1, lg.thigh.quaternion, _end);
        if (!Number.isFinite(beta) || !Number.isFinite(lg.thigh.quaternion.x + lg.thigh.quaternion.w)) {
          lg.thigh.quaternion.copy(_qJ);
          continue;
        }
        lg.shin.rotation.set(beta, 0, 0);
        // the sole keeps its turn in the world
        _qJ.copy(_qI).multiply(lg.thigh.quaternion).multiply(lg.shin.quaternion).invert();
        lg.foot.quaternion.copy(_qJ.multiply(this._footQ[i]));
      }
    }
  }

  /** Turn joint `j` by the root-frame rotation vector v about its pivot (P: its parent's turn in the
   *  root frame; null = its parent is the root). */
  _turn(j, P, v) {
    const a = Math.hypot(v[0], v[1], v[2]);
    if (!(a > 1e-6)) return;
    _ax.set(v[0] / a, v[1] / a, v[2] / a);
    _qR.setFromAxisAngle(_ax, a);
    if (P) {
      _qJ.copy(P).invert().multiply(_qR).multiply(P);
      j.quaternion.premultiply(_qJ);
    } else j.quaternion.premultiply(_qR);
  }
}
