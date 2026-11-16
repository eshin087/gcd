// Preview-only cloth coverage. Reuse the hero's cloth geometry/material path;
// never edit the shared outfit builders or the skin material used by the face.
import * as THREE from 'three';
import { DIM, BODY } from '../../entities/player/heroDims.js';
import { limb, sub, bandGeometry } from '../../entities/player/heroGeo.js';

export function installTemperedClothing(rig) {
  const { arms, offHand, materials: M } = rig;
  if (!offHand) return { select() {} };
  const fore = arms.L.fore, originals = [], hands = [];
  // Only the left forearm's fixed sleeve/wrap meshes are covered. The wrist,
  // flask and three animated hand shapes keep their original joints/visibility.
  for (const o of fore.children) {
    if (o.isMesh && (o.material === M.coat || o.material === M.leather)) originals.push([o, o.visible]);
  }
  fore.traverse(o => { if (o.isMesh && o.material === M.skin) hands.push([o, o.material]); });
  if (offHand.grip) hands.push([offHand.grip, offHand.grip.material]);
  const sleeve = new THREE.Group();
  sleeve.name = 'temperedLeftSleeve';
  sleeve.userData.slot = 'arms';
  fore.add(sleeve);
  const add = (geometry, material) => {
    const mesh = new THREE.Mesh(sub(geometry, 1), material);
    mesh.userData.slot = 'arms'; sleeve.add(mesh);
    return mesh;
  };
  const [wide, narrow] = BODY.foreArm;
  // Full cloth sleeve to the wrist; a slightly fuller elbow settles into a long
  // cuff over the back of the hand, instead of the exposed warm wrist/bindings.
  add(limb({ length: DIM.foreArm - 0.005, r0: wide + 0.012, r1: narrow + 0.014,
    bulge: 0.009, radial: 12, rings: 5 }), M.coat);
  add(limb({ length: 0.085, r0: narrow + 0.016, r1: narrow + 0.012,
    radial: 12, rings: 3 }).translate(0, -DIM.foreArm + 0.065, 0), M.coat);
  add(bandGeometry(narrow + 0.017, narrow + 0.015, 0.016, 12)
    .translate(0, -DIM.foreArm + 0.008, 0), M.hem);
  return {
    select(enabled) {
      sleeve.visible = enabled;
      for (const [mesh, visible] of originals) mesh.visible = enabled ? false : visible;
      for (const [mesh, material] of hands) mesh.material = enabled ? M.coat : material;
    },
  };
}
