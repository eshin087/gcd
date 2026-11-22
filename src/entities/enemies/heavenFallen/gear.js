import * as THREE from 'three';
import { ellipsoidGeometry, planarGUV } from '../../../render/glyphGeometry.js';
import { registerItem, getItem } from '../../player/gear/index.js';
import { boxGeometry, bandGeometry, tatterStrip, mergeGeometries, sub, foldLines, ribbonCrease, clumpGeometry, orientTo, limb } from '../../player/heroGeo.js';
import { toDragonLook } from '../ashDisciple/bodyArt.js';
import { FALLEN_ART } from './bodyArt.js';
import { fallenLookNow } from './look.js';
// (the outfits borrow the shared registry's pieces: these imports register them)
import '../ashDisciple/gear.js';

// Qian Yao's gear: a man on the hero's skeleton (buildHero(U, loadout), the same animator), drawn 1.4 x.
// Three bodies for the owner to pick from (`?fallenLook=a|b|c`, read when his rig is built), each built
// from the shared registry's pieces and a few of his own; each drawn through the wyrm's art path
// (FLAG.ART, ashDisciple/bodyArt.js toDragonLook: CLAUDE.md asks it of a new character) and also as its
// ink-line twin (`?fallenArt=ink`: the look the owner picked for the three other human bosses).
//   a  the Haloed Exile (recommended): a long bone-white robe over wide trousers, a bronze court belt,
//      forearms bound, a topknot through a broken crown ring, two sash ends that float UP behind his
//      shoulders, and a broken bronze halo wheel (a third of it gone) behind his head: his sun gauge,
//      lit while radiant (its inner ring is the rig's `flask` instance: never drawn as a flask on him).
//   b  the Chained Judge: a layered court robe, stiff wide shoulder boards, the official's hat with two
//      long level wings, broken shackles on both wrists trailing chain.
//   c  the Gilt Guardian: a lamellar skirt and cuirass, one great pauldron, long loose hair, a bronze
//      flame-shaped aureole behind his whole back (its inner rim lit while radiant).
// No cape, no chest emblem, no red and blue, no forelock curl, no bare chest. Palette: bone white,
// bronze, ash grey; the light is white-gold (look.js).
// His weapon, HEAVEN'S RULE: a four-edged bronze bar (a jian mace), 1.1 m of it past a small guard.
// Materials (his own instances; look.js writes the colours): `trim` = the bar's bronze (kept on the
// ink-line material in the art path: a bar is thinner than an art cell), `bevel` = its four edges,
// `shirt` = its grip and his belt's cord, `facing` = his bronze (the crown ring, the halo, the boards,
// the shackles, the aureole), `flask` = the light in the wheel / the aureole, `hem` = the sash ends.

const BAR = Object.freeze({ gripBack: 0.14, guard: 0.07, base: 0.09, tip: 1.2, w: 0.05, tipW: 0.032 });
/** The bar's ends along the weapon joint's +Z (duelist.js kit.blade). */
export const RULE = Object.freeze({ guard: BAR.guard, tip: BAR.tip });

/** Every item's build goes through here: the first one turns the rig to the art path (unless ink). */
function opted(build) {
  return (ctx) => {
    const L = fallenLookNow();
    if (L.art) toDragonLook(ctx, FALLEN_ART[L.body] ?? FALLEN_ART.a);
    return build(ctx);
  };
}
/** A shared registry piece worn by him: his opted() first (so his art spec wins), then its own build. */
function borrowed(id, slot, from) {
  return { id, slot, name: from.name, hair: from.hair, hidesHair: from.hidesHair, build: opted((ctx) => from.build(ctx)) };
}

const torus = (R, tube, arc = Math.PI * 2, radial = 5, tubular = 28) => {
  const g = new THREE.TorusGeometry(R, tube, radial, tubular, arc);
  planarGUV(g, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  return g;
};

// ---------------------------------------------------------------- the bar: Heaven's Rule
function buildRule({ sword, M, mesh }) {
  const D = BAR, L = D.tip - D.base;
  // the body: a square section turned 45 degrees (its four edges catch the light), tapering
  {
    const g = new THREE.BoxGeometry(D.w, D.w, L, 1, 1, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getZ(i) + L / 2) / L, k = 1 + (D.tipW / D.w - 1) * t;
      p.setX(i, p.getX(i) * k);
      p.setY(i, p.getY(i) * k);
    }
    g.rotateZ(Math.PI / 4);
    g.translate(0, 0, D.base + L / 2);
    g.computeVertexNormals();
    planarGUV(g, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1));
    mesh(sword, sub(g, 0), M.trim);
  }
  // the four edges, and bands along it (the segments of a jian mace)
  {
    const parts = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const e = boxGeometry(0.008, 0.008, L * 0.96, 0, 0, D.base + L * 0.48);
      const p = e.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getZ(i) - D.base) / L, r = (D.w / Math.SQRT2) * (1 + (D.tipW / D.w - 1) * t);
        p.setX(i, p.getX(i) + Math.cos(a) * r);
        p.setY(i, p.getY(i) + Math.sin(a) * r);
      }
      parts.push(e);
    }
    mesh(sword, mergeGeometries(parts), M.bevel);
    const bands = [];
    for (let k = 1; k <= 5; k++) {
      const z = D.base + (k / 6) * L, s = (1 + (D.tipW / D.w - 1) * (k / 6)) * D.w * 1.25;
      bands.push(sub(boxGeometry(s, s, 0.03, 0, 0, z, 0, 0, Math.PI / 4), k & 1));
    }
    mesh(sword, mergeGeometries(bands), M.trim);
  }
  // a small square guard, the grip in cord, a ring pommel
  mesh(sword, mergeGeometries([boxGeometry(0.11, 0.11, 0.03, 0, 0, D.guard, 0, 0, Math.PI / 4), boxGeometry(0.05, 0.05, 0.05, 0, 0, -D.gripBack - 0.02, 0, 0, Math.PI / 4)]), M.trim);
  const len = D.gripBack + D.guard - 0.015, bands = [];
  for (let k = 0; k < 6; k++) bands.push(sub(boxGeometry(0.034, 0.034, len / 6 + 0.002, 0, 0, -D.gripBack + ((k + 0.5) * len) / 6), k & 1));
  mesh(sword, mergeGeometries(bands), M.shirt);
}

// ---------------------------------------------------------------- a: the crown, the halo, the sash ends
/** The topknot through a broken crown ring (head space, before BODY.headScale). Keeps the hair cap. */
function buildCrown({ head, M, mesh }) {
  mesh(head, sub(ellipsoidGeometry(0.045, 0.05, 0.045, { widthSegs: 10, heightSegs: 6 }).translate(0, 0.275, -0.035), 1), M.hair);
  // the broken ring of the crown he wore in heaven: an arc round the knot, a gap at the back
  const ring = torus(0.07, 0.011, Math.PI * 1.45, 4, 18);
  ring.rotateX(Math.PI / 2);
  ring.rotateY(Math.PI * 0.27);
  ring.translate(0, 0.262, -0.035);
  mesh(head, ring, M.facing);
  // the pin through the knot
  mesh(head, boxGeometry(0.22, 0.012, 0.012, 0, 0.29, -0.035, 0, 0.3, 0.12), M.facing);
}

/** The broken halo wheel behind his head (chest space) and the two sash ends rising behind his shoulders. */
function buildHalo({ chest, M, mesh, joint }) {
  const hub = joint(chest, 0, 0.56, -0.24);
  // the wheel: a broken rim (a third gone at the lower right), spokes, a lit inner ring
  const R = 0.34;
  const rim = torus(R, 0.026, Math.PI * 1.36, 4, 30);
  rim.rotateZ(-Math.PI * 0.18);
  mesh(hub, rim, M.facing);
  const lit = torus(R * 0.78, 0.016, Math.PI * 1.3, 4, 26);
  lit.rotateZ(-Math.PI * 0.16);
  mesh(hub, lit, M.flask);
  const spokes = [];
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI * 0.18 + (k / 7) * Math.PI * 1.36 + 0.15;
    spokes.push(sub(boxGeometry(0.018, R * 0.86, 0.016, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0, 0, 0, a - Math.PI / 2), k & 1));
  }
  spokes.push(boxGeometry(0.07, 0.07, 0.03, 0, 0, 0, 0, 0, Math.PI / 4));
  mesh(hub, mergeGeometries(spokes), M.facing);
  // the sash ends: two long strips that float UP behind his shoulders (a strip hangs -Y: turned over)
  for (const [sx, lean, seed] of [[0.14, 0.22, 31], [-0.15, -0.3, 47]]) {
    const g = foldLines(tatterStrip(0.62, 0.075, { fork: true, curl: 0.18, seed }), ribbonCrease(0.075, seed * 0.3));
    g.rotateZ(Math.PI + lean);
    g.rotateX(-0.35);
    g.translate(sx, 0.08, -0.17);
    mesh(chest, g, M.hem);
  }
}

// ---------------------------------------------------------------- b: the hat, the boards, the shackles
/** The official's hat: a black band, a raised back, two long level wings. Hides his hair. */
function buildHat({ head, M, mesh }) {
  mesh(head, sub(bandGeometry(0.11, 0.12, 0.08, 20), 1), M.shirt, 0, 0.22, -0.01);
  mesh(head, boxGeometry(0.2, 0.1, 0.12, 0, 0.29, -0.05), M.shirt);
  mesh(head, boxGeometry(0.24, 0.02, 0.2, 0, 0.255, -0.005), M.shirt);
  for (const s of [-1, 1]) mesh(head, boxGeometry(0.42, 0.016, 0.05, s * 0.32, 0.29, -0.09), M.facing);
}

/** Stiff, wide shoulder boards of the court robe (chest space). */
function buildBoards({ chest, M, mesh }) {
  for (const s of [-1, 1]) {
    mesh(chest, boxGeometry(0.26, 0.04, 0.24, s * 0.21, 0.1, -0.01, 0, 0, -s * 0.12), M.coat);
    mesh(chest, boxGeometry(0.27, 0.012, 0.25, s * 0.21, 0.125, -0.01, 0, 0, -s * 0.12), M.facing);
  }
}

/** Broken shackles on both wrists, each trailing a short length of chain (on the forearms). */
function buildShackles({ arms, M, mesh, DIM }) {
  for (const side of ['R', 'L']) {
    const fore = arms[side].fore, y = -DIM.foreArm + 0.07;
    mesh(fore, sub(bandGeometry(0.052, 0.05, 0.06, 14), 1), M.facing, 0, y, 0);
    const links = [];
    for (let i = 0; i < 5; i++) links.push(sub(boxGeometry(i & 1 ? 0.012 : 0.03, 0.05, i & 1 ? 0.03 : 0.012, 0.02, y - 0.06 - i * 0.045, -0.03), i & 1));
    mesh(fore, mergeGeometries(links), M.facing);
  }
}

// ---------------------------------------------------------------- c: the mane, the aureole
/** Long loose hair over the back (head space). Keeps the hair cap. */
function buildMane({ head, M, mesh }) {
  const mass = [], tips = [];
  for (let i = 0; i < 9; i++) {
    const a = -1.1 + (i / 8) * 2.2, x = Math.sin(a) * 0.09, z = -0.07 - Math.cos(a) * 0.03;
    const dir = [Math.sin(a) * 0.25, -1, -0.35], L = 0.34 + 0.08 * Math.cos(a * 2);
    mass.push(sub(orientTo(clumpGeometry(L * 0.5, 0.05, 0.022, { t0: 0, t1: 0.5, curl: 0.1, taper: 0.7 }), [x, 0.2, z], dir, [0, 0, -1]), i & 1));
    tips.push(sub(orientTo(clumpGeometry(L, 0.05, 0.022, { t0: 0.5, t1: 1, curl: 0.1, taper: 0.7 }), [x, 0.2, z], dir, [0, 0, -1]), i & 1));
  }
  mesh(head, mergeGeometries(mass), M.hair);
  mesh(head, mergeGeometries(tips), M.hairTip);
}

/** A bronze aureole shaped like a flame behind his whole back (chest space): a ring of tongues, a lit
 *  inner rim. */
function buildAureole({ chest, M, mesh, joint }) {
  const hub = joint(chest, 0, 0.12, -0.3);
  const parts = [], lit = [];
  const n = 15;
  for (let k = 0; k < n; k++) {
    const a = (k / (n - 1)) * Math.PI * 1.25 - Math.PI * 0.125; // the upper arch, open at the bottom
    const ca = Math.cos(a), sa = Math.sin(a), rx = 0.52, ry = 0.78;
    const x = ca * rx, y = sa * ry - 0.1;
    const len = 0.18 + 0.12 * Math.abs(Math.sin(a * 2.2)) + (k === (n >> 1) ? 0.14 : 0);
    parts.push(sub(boxGeometry(0.07, len, 0.025, x + ca * len * 0.4, y + sa * len * 0.4, 0, 0, 0, a - Math.PI / 2), k & 1));
    lit.push(boxGeometry(0.05, 0.02, 0.018, x * 0.92, y * 0.94 - 0.01, 0.01, 0, 0, a + Math.PI / 2));
  }
  mesh(hub, mergeGeometries(parts), M.facing);
  mesh(hub, mergeGeometries(lit), M.flask);
  mesh(hub, limb({ length: 0.5, r0: 0.02, r1: 0.02, radial: 4, rings: 1, capSegs: 1 }).translate(0, 0.1, 0), M.facing);
}

// ---------------------------------------------------------------- the set
/** His own items, and his wearing of the shared pieces (so that his art spec is applied first). */
export const FALLEN_ITEMS = [
  { id: 'fallen.rule', slot: 'weapon', name: "Heaven's Rule", dims: RULE, build: opted(buildRule) },
  { id: 'fallen.crown', slot: 'head', name: 'Broken Crown', hair: ['cap'], build: opted(buildCrown) },
  { id: 'fallen.halo', slot: 'back', name: 'Broken Halo', build: opted(buildHalo) },
  { id: 'fallen.hat', slot: 'head', name: "Judge's Hat", hidesHair: true, build: opted(buildHat) },
  { id: 'fallen.boards', slot: 'shoulders', name: 'Shoulder Boards', build: opted(buildBoards) },
  { id: 'fallen.shackles', slot: 'back', name: 'Broken Shackles', build: opted(buildShackles) },
  { id: 'fallen.mane', slot: 'head', name: 'Loose Hair', hair: ['cap'], build: opted(buildMane) },
  { id: 'fallen.aureole', slot: 'back', name: 'Flame Aureole', build: opted(buildAureole) },
];
for (const item of FALLEN_ITEMS) registerItem(item);

/** A borrowed piece under his own id (built through his opted()). Registered once, on first need. */
function wear(id) {
  const mine = `fallen.${id}`;
  if (getItem(mine)) return mine;
  const from = getItem(id);
  if (!from) return null;
  registerItem(borrowed(mine, from.slot, from));
  return mine;
}

/** The loadout of body `body` ('a' | 'b' | 'c'). */
export function fallenLoadout(body = 'a') {
  if (body === 'b') {
    return Object.freeze({
      head: 'fallen.hat', chest: wear('moon.robe'), shoulders: 'fallen.boards', arms: wear('moon.sleeves'), legs: wear('ash.legs'),
      waist: wear('moon.skirt'), back: 'fallen.shackles', weapon: 'fallen.rule',
    });
  }
  if (body === 'c') {
    return Object.freeze({
      head: 'fallen.mane', chest: wear('warden.cuirass'), shoulders: wear('warden.pauldron'), arms: wear('warden.arms'), legs: wear('ash.legs'),
      waist: wear('warden.skirt'), back: 'fallen.aureole', weapon: 'fallen.rule',
    });
  }
  return Object.freeze({
    head: 'fallen.crown', chest: wear('ash.robe'), shoulders: null, arms: wear('ash.sleeves'), legs: wear('ash.legs'),
    waist: wear('ash.skirt'), back: 'fallen.halo', weapon: 'fallen.rule',
  });
}
