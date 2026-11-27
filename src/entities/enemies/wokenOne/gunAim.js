import * as THREE from 'three';
import { TUNING } from './tuning.js';
import { oneMovesNow } from './look.js';

// Xin Yi's guns aimed down the line of fire (ADR-253, `?oneMoves=b`; drawn only: no gameplay point moves).
// What the gun audit measured on `a` (woke.mjs GUNS): the right gun sits on the fist joint with its barrel
// along the knuckles, and in every aim of his the knuckles faced sideways, so the right barrel pointed 55 -
// 113 degrees off the line its shots flew (Two Thunders' side-on aim: 144); the left one 24 - 36 degrees; the
// other hand's gun 55 - 90 degrees off the hero; each shot left 0.2 - 0.3 m below the drawn gun (the shots'
// height is held between 0.9 and 1.4 m; in Iron in the Air 0.7 - 0.9 m below it); nothing moved when he fired.
// Here, after the animator, every frame the guns show (phase 2):
//   - each gun is turned in its hand so its barrel runs down its forearm (elbow to wrist), and onto the hero's
//     chest when the forearm points within `aimCone` of it (an aimed arm: the barrel exactly on him);
//   - a shot (fire(left), iron.js) kicks that arm: the upper arm raised and the gun climbing `recoil[0]` rad,
//     pulled back `recoil[1]` m, both falling off with the halflife `recoil[2]` s (Holden's damper);
//   - muzzle(left, out): where the drawn muzzle is, for the shot to leave from (iron.js).
// The arm's turn is put back before the next frame's animator (restore): nothing accumulates.

const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qd = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _ax = new THREE.Vector3();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c2 = new THREE.Vector3();
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class GunAim {
  constructor(d) {
    this.d = d;
    this.k = [0, 0]; // each hand's recoil, 1 at the shot, falling off
    this.saved = [new THREE.Quaternion(), new THREE.Quaternion()];
    this.held = [false, false];
    this.savedP = new THREE.Vector3();
    this.savedQ = new THREE.Quaternion();
    this.heldS = false;
    this.muz = [new THREE.Vector3(), new THREE.Vector3()];
    this.ok = [false, false];
    this.touched = false;
    this.home = null; // the guns' own transforms (as built), put back when the pass is off
  }

  /** On: `?oneMoves=b` and his guns showing. */
  on() {
    const G = this.d.rig?.root?.userData?.dress?.guns;
    return oneMovesNow() === 'b' && Array.isArray(G) && G.length >= 4 && !!G[0]?.visible;
  }

  /** A shot leaves the right (left: the left) gun: its arm kicks. */
  fire(left) {
    this.k[left ? 1 : 0] = 1;
  }

  /** Where the drawn muzzle of a gun is (false: not known this frame; the hand's point then). */
  muzzle(left, out) {
    const i = left ? 1 : 0;
    if (!this.ok[i]) return false;
    out.x = this.muz[i].x;
    out.y = this.muz[i].y;
    out.z = this.muz[i].z;
    return true;
  }

  /** Before the animator: the arms' kick of last frame taken off again. */
  restore() {
    const A = this.d.rig?.arms;
    if (!A) return;
    for (let i = 0; i < 2; i++) {
      if (!this.held[i]) continue;
      (i ? A.L : A.R).upper.quaternion.copy(this.saved[i]);
      this.held[i] = false;
    }
    if (this.heldS && this.d.rig.sword) {
      this.d.rig.sword.position.copy(this.savedP);
      this.d.rig.sword.quaternion.copy(this.savedQ);
      this.heldS = false;
    }
  }

  /** After the animator and the drawn points: the kick, the guns turned onto their line, the muzzles. */
  apply(dt) {
    const d = this.d, R = d.rig, G = R?.root?.userData?.dress?.guns;
    this.ok[0] = this.ok[1] = false;
    if (!Array.isArray(G)) return;
    if (!this.home) this.home = G.map((m) => ({ p: m.position.clone(), q: m.quaternion.clone() }));
    if (!this.on()) {
      if (this.touched) {
        G.forEach((m, i) => {
          m.position.copy(this.home[i].p);
          m.quaternion.copy(this.home[i].q);
        });
        this.touched = false;
      }
      this.k[0] = this.k[1] = 0;
      return;
    }
    const M = TUNING.motion, RC = M.recoil, fall = 2 ** (-Math.max(0, dt) / Math.max(1e-3, RC[2]));
    const p = d.game?.player;
    const chest = p?.position ? _c.set(p.position.x, M.chestY, p.position.z) : null;
    for (let i = 0; i < 2; i++) {
      const arm = i ? R.arms.L : R.arms.R, hand = i ? arm.wrist ?? arm.fore : R.sword;
      this.k[i] = this.k[i] > 1e-3 ? this.k[i] * fall : 0;
      const k = this.k[i];
      // the kick: the upper arm raised round the shoulder (about the level axis across the arm), worked in his
      // root's own space (his drawn matrices carry the camera lean, a shear: turned through them the arm bent)
      if (k > 0 && R.root) {
        _inv.copy(R.root.matrixWorld).invert();
        arm.upper.getWorldPosition(_a).applyMatrix4(_inv);
        hand.getWorldPosition(_b).applyMatrix4(_inv);
        _ax.set(_b.x - _a.x, 0, _b.z - _a.z);
        if (_ax.lengthSq() > 1e-6) {
          _ax.normalize().cross(_UP).normalize();
          _qd.setFromAxisAngle(_ax, -RC[0] * 0.5 * k);
          // (a joint's turn in its parent's space: the parent's own turn under the root, rigid)
          const turn = (j) => {
            _rel.copy(_inv).multiply(j.parent.matrixWorld).decompose(_p, _qp, _s);
            _q.copy(_qp).invert().multiply(_qd).multiply(_qp);
            j.quaternion.premultiply(_q);
          };
          this.saved[i].copy(arm.upper.quaternion);
          this.held[i] = true;
          turn(arm.upper);
          // (the right gun's joint is posed in the body's space, not on the arm (model.js: body → sword):
          // it goes round the shoulder with the arm, or the arm rose off the gun)
          if (!i && hand.parent && hand.parent !== arm.fore) {
            this.savedP.copy(hand.position);
            this.savedQ.copy(hand.quaternion);
            this.heldS = true;
            _rel.copy(_inv).multiply(hand.parent.matrixWorld);
            _c2.copy(_a).applyMatrix4(_t.copy(_rel).invert()); // the shoulder in the joint's parent space
            turn(hand);
            _p.copy(hand.position).sub(_c2).applyQuaternion(_q).add(_c2);
            hand.position.copy(_p);
          }
          arm.upper.updateMatrixWorld(true);
          hand.updateMatrixWorld(true);
        }
      }
      arm.upper.getWorldPosition(_a);
      hand.getWorldPosition(_b);
      // the barrel: down the forearm, onto the hero's chest when the arm points near him
      arm.fore.getWorldPosition(_a);
      _X.subVectors(_b, _a);
      if (_X.lengthSq() < 1e-8) continue;
      _X.normalize();
      if (chest) {
        _Y.subVectors(chest, _b).normalize();
        const t = 1 - smooth(M.aimCone * 0.6, M.aimCone, _X.angleTo(_Y));
        if (t > 0) _X.lerp(_Y, t).normalize();
      }
      // (the climb: the barrel tipped up about the level axis across it)
      if (k > 0) {
        _ax.set(_X.x, 0, _X.z);
        if (_ax.lengthSq() > 1e-6) {
          _ax.normalize().cross(_UP).normalize();
          _X.applyAxisAngle(_ax, -RC[0] * k);
        }
      }
      // the gun's frame: its barrel X, its top Z (the grip down -Z) as near the world's up as the barrel allows
      _Z.copy(_UP).addScaledVector(_X, -_UP.dot(_X));
      if (_Z.lengthSq() < 1e-6) _Z.set(0, 0, 1).addScaledVector(_X, -_X.z);
      _Z.normalize();
      _Y.crossVectors(_Z, _X);
      // (the right gun is built in the fist's frame, its barrel +X; the left one turned onto the wrist, its
      // barrel -Y: gear.js buildGuns)
      if (i) _m.makeBasis(_Y, _a.copy(_X).negate(), _Z);
      else _m.makeBasis(_X, _Y, _Z);
      _q.setFromRotationMatrix(_m);
      hand.matrixWorld.decompose(_p, _qp, _s);
      _q.premultiply(_qp.invert());
      for (let j = i * 2; j < i * 2 + 2; j++) {
        const m = G[j];
        if (!m || m.parent !== hand) continue;
        m.quaternion.copy(this.home[j].q).premultiply(_q);
        // (turned round the grip: the gun stays in the hand; pulled back along its barrel by the kick)
        _a.copy(this.home[j].p);
        m.position.copy(_a).applyQuaternion(_q);
        _b.copy(_X).multiplyScalar(-RC[1] * k);
        _b.applyQuaternion(_qp).divideScalar(Math.max(1e-3, _s.x));
        m.position.add(_b);
        m.updateMatrixWorld(true);
      }
      // the muzzle: the bright cell's centre, drawn
      const mz = G[i * 2 + 1];
      if (mz?.geometry) {
        if (!mz.geometry.boundingBox) mz.geometry.computeBoundingBox();
        mz.geometry.boundingBox.getCenter(this.muz[i]).applyMatrix4(mz.matrixWorld);
        this.ok[i] = Number.isFinite(this.muz[i].x + this.muz[i].y + this.muz[i].z);
      }
    }
    this.touched = true;
  }
}
