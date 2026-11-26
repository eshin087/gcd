// A DEV AID (not the shipped look): a body with body.js's interface that draws a plain box per bone,
// a box head, and a thin blade on the weapon sockets, so the clip engine can be seen and filmed before
// the real body exists. The left side is tinted cool, the right warm (which hand is which, in a film).
// Plain materials on purpose; the showcase takes it with `?body=debug`, or when body.js draws nothing.
import * as THREE from 'three';
import { J, JI, restOffsets } from './skeleton.js';
import { HDIM } from './dims.js';

// bones: [from joint, to joint (its rest offset gives the length and direction), thickness m]
const BONES = [
  ['hips', 'spine', 0.2], ['spine', 'chest', 0.22], ['chest', 'neck', 0.26], ['neck', 'head', 0.08],
  ['hips', 'thighL', 0.07], ['hips', 'thighR', 0.07], ['chest', 'clavL', 0.07], ['chest', 'clavR', 0.07],
  ['clavL', 'upperArmL', 0.07], ['upperArmL', 'foreArmL', 0.085], ['foreArmL', 'handL', 0.07], ['handL', 'weaponL', 0.06],
  ['clavR', 'upperArmR', 0.07], ['upperArmR', 'foreArmR', 0.085], ['foreArmR', 'handR', 0.07], ['handR', 'weaponR', 0.06],
  ['thighL', 'shinL', 0.12], ['shinL', 'footL', 0.1], ['footL', 'toeL', 0.08],
  ['thighR', 'shinR', 0.12], ['shinR', 'footR', 0.1], ['footR', 'toeR', 0.08],
];

const sideOf = (name) => (/L$/.test(name) ? 'L' : /R$/.test(name) ? 'R' : 'C');

export function buildDebugBody(game, { dims = HDIM, scale = 1 } = {}) {
  const object3d = new THREE.Group();
  object3d.name = 'hero2:debug';
  object3d.scale.setScalar(scale);
  const rest = restOffsets(dims);
  const mats = {
    C: new THREE.MeshLambertMaterial({ color: 0xb8b2a6 }),
    L: new THREE.MeshLambertMaterial({ color: 0x6f9fd8 }),
    R: new THREE.MeshLambertMaterial({ color: 0xd88a5a }),
    blade: new THREE.MeshLambertMaterial({ color: 0xe8f0ff, emissive: 0x334455 }),
    flask: new THREE.MeshLambertMaterial({ color: 0xd8b040 }),
  };
  const joints = [];
  for (let j = 0; j < J; j++) {
    const g = new THREE.Group();
    g.name = 'h2j' + j;
    g.matrixAutoUpdate = true;
    object3d.add(g);
    joints.push(g);
  }
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  for (const [a, b, th] of BONES) {
    const ib = JI[b];
    dir.set(rest[ib * 3], rest[ib * 3 + 1], rest[ib * 3 + 2]);
    const len = dir.length();
    if (len < 1e-4) continue;
    const geo = new THREE.BoxGeometry(th, len, th * (/foot|toe/.test(a) ? 1.3 : 1));
    geo.translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, mats[sideOf(b)]);
    m.quaternion.setFromUnitVectors(up, dir.normalize());
    m.castShadow = true;
    joints[JI[a]].add(m);
  }
  // the head and the hands
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.22).translate(0, 0.1, 0.01), mats.C);
  joints[JI.head].add(head);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.08).translate(0, 0.08, 0.13), mats.C);
  joints[JI.head].add(nose);
  for (const s of ['L', 'R']) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.08).translate((s === 'L' ? 1 : -1) * 0.05, 0, 0), mats[s]);
    joints[JI['hand' + s]].add(hand);
  }
  // props on the sockets: a blade along +Z (flats facing +-Y), a flask
  const props = {};
  for (const s of ['L', 'R']) {
    const sock = joints[JI['weapon' + s]];
    const blade = new THREE.Group();
    const steel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.008, dims.blade).translate(0, 0, dims.blade / 2 + 0.1), mats.blade);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2).translate(0, 0, 0), mats[s]);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.025).translate(0, 0, 0.1), mats.C);
    blade.add(steel, grip, guard);
    blade.visible = false;
    const flask = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), mats.flask);
    flask.visible = false;
    sock.add(blade, flask);
    props[s] = { blade, flask, kind: null };
  }
  const tv = new THREE.Vector3();
  const body = {
    object3d,
    dims,
    debug: true,
    drawn: true,
    setProp(side, kind) {
      const p = props[side];
      if (!p) return;
      p.kind = kind ?? null;
      p.blade.visible = kind === 'sword';
      p.flask.visible = kind === 'flask';
    },
    update(world) {
      const P = world.p, R = world.r;
      for (let j = 0; j < J; j++) {
        const g = joints[j];
        g.position.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
        g.quaternion.set(R[j * 4], R[j * 4 + 1], R[j * 4 + 2], R[j * 4 + 3]);
      }
      object3d.updateMatrixWorld(true);
    },
    reset() {},
    blade(side, a, b) {
      const p = props[side];
      if (!p || p.kind !== 'sword') return false;
      const m = joints[JI['weapon' + side]].matrixWorld;
      a.copy(tv.set(0, 0, dims.bladeBase).applyMatrix4(m));
      b.copy(tv.set(0, 0, dims.bladeTip).applyMatrix4(m));
      return true;
    },
    dispose() {
      object3d.removeFromParent();
      object3d.traverse((o) => o.geometry?.dispose?.());
      for (const m of Object.values(mats)) m.dispose();
    },
  };
  return body;
}
