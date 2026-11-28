// THE ONE-PIECE COAT (`?coat=one`, the default; the owner, 2026-11-27: "It should not be a skirt and needs to be
// one full cloak but with great animation that looks natural as the character moves and attacks"; asked, they
// chose "the coat's lower half one continuous sheet from the waist to the calves, open at the front, the
// half-cape kept", with a torn, ragged hem). The six panels hung side by side read as a skirt: each swung on
// its own spring and the gaps between them opened and closed. Now ONE sheet runs from the open front's left
// edge round his back to its right edge, and its shape is rebuilt every frame from COAT_CHAINS: twelve
// two-segment springs round the waist (the animator's coat springs, anim.js _coat, each pulled toward its
// neighbours: `nbr`), every column of the sheet swung as the two chains it lies between, blended by angle.
// The dark coat above, the dusty lavender torn zone below (the hem's own claw points, longest at the back),
// the lining inside, grey-violet piping down both front edges, and the torn strips under the hem on their own
// springs, as before. `?coat=panels` builds the six panels as before.

import * as THREE from 'three';
import { gridGeometry, tatterStrip, foldLines, ribbonCrease, rng, lerp } from '../heroGeo.js';

export const COAT_IDS = ['one', 'panels'];
let coatNow = 'one';
export const coatMode = () => coatNow;
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('coat') : null;
  if (q && COAT_IDS.includes(q)) coatNow = q;
}
/** Pick the coat for the next build (the hero is rebuilt on a reload); false for an unknown id. */
export function setCoat(m) {
  if (!COAT_IDS.includes(m)) return false;
  coatNow = m;
  return true;
}

/** THE RANDOM STREAM KEPT (the headless sims seed Math.random once per build, and three.js draws four numbers
 *  from it for every object's id: a hero built of other objects moved every roll of the fight after him, and
 *  seeded checks on other bosses flipped). The six panels' build drew `build` more numbers and their batch
 *  (render/rigidBatch.js) `batch` more than the one-piece coat's: drawn here, the fights after his build see
 *  the stream they did. Measured with both coats built in the page (Math.random counted). Nothing on screen. */
// (`kick`: anim.js kickCoat drew 3 a panel and 2 a strip, 6 × 3 + 12 × 2)
export const RANDOM_PAD = { build: 240, batch: 8, kick: 42 };
/** A coat kick's own noise (anim.js kickCoat): a small stream of its own, never Math.random nor the animator's. */
export function coatKickRandom(seed = 0x2c0a7) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
/** Draw n numbers from Math.random (and nothing else). */
export function padRandom(n) {
  for (let i = 0; i < n; i++) Math.random();
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** The sheet's numbers: `edge` (rad) the open front's edges from straight ahead at the waist; `chains` the
 *  springs' azimuths (+ = his left); `len` [upper, lower] (m) by |azimuth| (front … back); `flare` by
 *  |azimuth|; `torn` the share of the lower segment that is the lavender torn zone; `cols` / `rows` the
 *  sheet's grid; `claw` [every n columns, extra length (m)] the hem's points, `jag` the rest's ragged edge;
 *  `fold` [top, bottom] amplitude (m) of the soft vertical folds and `waves` across the whole sheet;
 *  `strips` per chain; `piping` (rad) the front edges' band. */
export const COAT_ONE = {
  edge: 0.6,
  // (a chain at each open front edge: the legs push the sheet off them there too; the edges hung past the
  // first chain and a lunging thigh went through them)
  chains: [0.64, 1.04, 1.48, 1.93, 2.38, 2.84, -2.84, -2.38, -1.93, -1.48, -1.04, -0.64],
  // (the front 13 mm a segment shorter than the panels': lying on his side a front chain cannot lie flat in its
  // swing limits, and its hem sank past the panels' known 12 cm)
  len: { front: [0.268, 0.268], back: [0.306, 0.306] },
  flare: [[0.7, 0.12], [1.2, 0.26], [1.85, 0.36], [2.4, 0.3], [Math.PI, 0.26]],
  torn: 0.45,
  cols: 46, rowsTop: 9, rowsHem: 5,
  claw: [4, 0.075], jag: 0.022,
  fold: [0.003, 0.024], waves: 11,
  strips: [[], [0.11], [0.12, 0.07], [0.15], [0.12, 0.09], [0.16], [0.16], [0.09, 0.12], [0.15], [0.07, 0.12], [0.11], []],
  piping: 0.035,
};
const flareAt = (a) => {
  const x = Math.abs(a), F = COAT_ONE.flare;
  if (x <= F[0][0]) return F[0][1];
  for (let i = 1; i < F.length; i++) if (x <= F[i][0]) return lerp(F[i - 1][1], F[i][1], smooth(F[i - 1][0], F[i][0], x));
  return F[F.length - 1][1];
};
const lenAt = (a) => {
  const k = smooth(0.9, 2.6, Math.abs(a)), L = COAT_ONE.len;
  return [lerp(L.front[0], L.back[0], k), lerp(L.front[1], L.back[1], k)];
};
/** The waist ring's radius at azimuth a (the coat shell's ellipse, as the panels hung). */
const ringR = (a, DIM) => 1 / Math.hypot(Math.sin(a) / DIM.coatR, Math.cos(a) / (DIM.coatR * 0.69));
/** Unwrapped round the back from the left front edge: 0 … 2π − 2·edge. */
const around = (a) => (a >= 0 ? a : a + 2 * Math.PI) - COAT_ONE.edge;

/** Build the springs and the sheet on the pelvis. Returns { coat, cloth, keep }: the chains the animator
 *  springs (the panels' contract: anchor, segs, def, strips, len, r0), the cloth to rebuild every frame
 *  after them (anim.js: cloth[i].update()), and the meshes the static merge must leave alone. */
export function buildCoatOne({ pelvis, M, DIM, mesh, joint }) {
  const C = COAT_ONE, NC = C.chains.length;
  const coat = [];
  C.chains.forEach((az, i) => {
    const R0 = ringR(az, DIM);
    const anchor = joint(pelvis, Math.sin(az) * R0, DIM.coatY, Math.cos(az) * R0);
    anchor.rotation.y = az;
    const s0 = joint(anchor);
    const [L0, L1] = lenAt(az);
    const s1 = joint(s0, 0, -L0, 0);
    // (the width the collision tests give a chain: the arc to its neighbours)
    // (overlapping its neighbours': every part of the sheet is under some chain's rules; a front edge's own only
    // its edge, the open front is no cloth)
    const w = i === 0 || i === NC - 1 ? [0.06, 0.08, 0.1] : [0.15, 0.2, 0.26];
    const strips = [];
    const S = C.strips[i] ?? [];
    S.forEach((len, k) => {
      const u = (S.length > 1 ? (k / (S.length - 1) - 0.5) * 0.09 : 0);
      const R2 = R0 + 0.25 * (L0 + L1);
      const a = u / R2;
      const sj = joint(s1, Math.sin(a) * R2 - Math.sin(0) * R2, -L1 + 0.012, (Math.cos(a) - 1) * R2);
      sj.rotation.y = a;
      const sw = 0.055;
      mesh(sj, foldLines(tatterStrip(len, sw, { fork: (i + k) % 3 === 1, curl: 0.25, seed: 2000 + i * 31 + k * 7 }), ribbonCrease(sw, i * 3.1 + k * 1.7)), M.hem);
      strips.push({ joint: sj, len, rest: a, phase: (i * 1.7 + k * 2.3) % (Math.PI * 2) });
    });
    const nbr = [i > 0 ? i - 1 : -1, i < NC - 1 ? i + 1 : -1];
    coat.push({ anchor, segs: [s0, s1], def: { az, w, len: [L0, L1], strips: S, fork: S.map(() => 0), out: 0, flare: flareAt(az), skew: 0, nbr, one: true }, strips, len: [L0, L1 + Math.max(0.12, S.length ? Math.max(...S) * 0.8 : 0)], r0: R0 });
    // (`len`: what the floor's rule keeps off the grass, the strips' reach included; a chain with none still
    // counts as much: the sheet's ragged hem hangs past it)
  });

  // ---- the sheet: columns from the left front edge round the back to the right one
  const span = 2 * Math.PI - 2 * C.edge;
  const r = rng(77);
  const col = (s) => C.edge + s * span; // unwrapped azimuth (the left edge = edge, the back = π)
  const azOf = (s) => {
    const a = col(s);
    return a > Math.PI ? a - 2 * Math.PI : a;
  };
  const NCOL = C.cols;
  // per column: its chains and their blend (by unwrapped angle), ring radius, lengths, the hem's tear
  const cA = new Int16Array(NCOL + 1), cB = new Int16Array(NCOL + 1), cW = new Float32Array(NCOL + 1);
  const cSin = new Float32Array(NCOL + 1), cCos = new Float32Array(NCOL + 1), cR = new Float32Array(NCOL + 1);
  const cL0 = new Float32Array(NCOL + 1), cL1 = new Float32Array(NCOL + 1), cHem = new Float32Array(NCOL + 1);
  const U = C.chains.map(around);
  for (let i = 0; i <= NCOL; i++) {
    const s = i / NCOL, a = azOf(s), u = col(s) - C.edge;
    let k = 0;
    while (k < NC - 1 && U[k + 1] <= u) k++;
    if (u <= U[0]) {
      cA[i] = cB[i] = 0;
      cW[i] = 0;
    } else if (k >= NC - 1) {
      cA[i] = cB[i] = NC - 1;
      cW[i] = 0;
    } else {
      cA[i] = k;
      cB[i] = k + 1;
      cW[i] = smooth(U[k], U[k + 1], u);
    }
    cSin[i] = Math.sin(a);
    cCos[i] = Math.cos(a);
    cR[i] = ringR(a, DIM);
    const [L0, L1] = lenAt(a);
    cL0[i] = L0;
    cL1[i] = L1;
    // the hem: ragged everywhere, a claw point every few columns (longest at the back, none at the front edges)
    const back = smooth(0.9, 2.5, Math.abs(a)), edgeFade = smooth(0, 0.06, Math.min(s, 1 - s));
    const claw = i % C.claw[0] === 2 ? C.claw[1] * (0.55 + 0.45 * back) * (0.7 + 0.6 * r()) : 0;
    cHem[i] = ((r() - 0.5) * C.jag + claw) * edgeFade;
  }
  // a sheet over [t0, t1] of the depth (0 the waist, 1 the hem with its tear), columns over [s0, s1]
  const part = (t0, t1, rows, s0 = 0, s1 = 1, cols = NCOL) => {
    const ci = new Int16Array(cols + 1), cf = new Float32Array(cols + 1); // (the sheet's column → the grid's, blended)
    const g = gridGeometry(cols, rows, (s, t, o) => {
      const x = lerp(s0, s1, s) * NCOL, i0 = Math.min(NCOL - 1, Math.floor(x)), f = x - i0;
      ci[Math.round(s * cols)] = i0;
      cf[Math.round(s * cols)] = f;
      const L = lerp(cL0[i0] + cL1[i0], cL0[i0 + 1] + cL1[i0 + 1], f);
      const hem = t1 === 1 && t === 1 ? lerp(cHem[i0], cHem[i0 + 1], f) : 0;
      const d = lerp(t0, t1, t) * L + hem;
      const u = (lerp(s0, s1, s) - 0.5) * span * 0.2; // (glyph columns along the hips)
      o[0] = 0;
      o[1] = -d;
      o[2] = 0;
      o[3] = u;
      o[4] = -d;
    }, true);
    // the depth of every vertex (m down the cloth) and its column, kept: the frame's rebuild needs only the chains
    const pos = g.attributes.position, n = pos.count, depth = new Float32Array(n), vc = new Int16Array(n), vf = new Float32Array(n), fz = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const ii = v % (cols + 1);
      depth[v] = -pos.getY(v);
      vc[v] = ci[ii];
      vf[v] = cf[ii];
      // soft vertical folds deepening toward the hem (the panels' own), across the whole sheet
      const sg = lerp(s0, s1, ii / cols), L = lerp(cL0[vc[v]] + cL1[vc[v]], cL0[vc[v] + 1] + cL1[vc[v] + 1], vf[v]);
      const tt = Math.min(1, depth[v] / L);
      fz[v] = lerp(C.fold[0], C.fold[1], tt) * Math.sin(sg * Math.PI * 2 * C.waves + 0.7) * smooth(0, 0.04, Math.min(sg, 1 - sg));
    }
    return { g, depth, vc, vf, fz };
  };
  const tH = (L0, L1) => (L0 + L1 * C.torn) / (L0 + L1); // (where the torn zone starts, as a share of the depth)
  const tTop = tH(lenAt(2)[0], lenAt(2)[1]);
  const parts = [];
  // (rebuilt every frame: drawn on its own, never copied into the hero's rigid batch (render/rigidBatch.js,
  // which would freeze the sheet as it was built), its buffers dynamic, no stale bounds to cull it by)
  const own = (m) => {
    m.userData.noBatch = true;
    m.frustumCulled = false;
    for (const k of ['position', 'normal']) m.geometry.attributes[k]?.setUsage(THREE.DynamicDrawUsage);
    return m;
  };
  const add = (P, mats) => {
    for (const m of mats) own(mesh(pelvis, P.g, m));
    parts.push(P);
    return P;
  };
  // (the folds DRAWN on the dark part: the panels' pleat field, an ink line down each fold's flank)
  const top = part(0, tTop, C.rowsTop);
  foldLines(top.g, (x, y, z, u, gy) => {
    const d = -gy, s = u / (span * 0.2) + 0.5;
    const ph = Math.PI * 2 * C.waves * (s + 0.004 * Math.sin(d * 9)) + 0.7 + Math.PI;
    return 0.5 + 0.62 * (Math.sin(ph) + 0.3 * Math.sin(ph * 2.3 + 1.7)) - 0.9 * Math.max(0, 1 - d / 0.16);
  });
  add(top, [M.coat, M.lining]);
  const hem = part(tTop, 1, C.rowsHem);
  foldLines(hem.g, (x, y, z, u, gy) => {
    const s = u / (span * 0.2) + 0.5;
    return 0.5 + 0.62 * Math.sin(Math.PI * 2 * C.waves * s + 0.7 + Math.PI);
  });
  add(hem, [M.hem, M.lining]);
  // piping down both open front edges (a narrow band of the sheet's first / last columns)
  const pw = C.piping / span;
  for (const [a, b] of [[0, pw], [1 - pw, 1]]) {
    const P = part(0, 1, C.rowsTop + C.rowsHem, a, b, 1);
    own(mesh(pelvis, P.g, M.piping));
    parts.push(P);
  }
  const keep = [];
  pelvis.traverse((o) => {
    if (o.isMesh && parts.some((P) => P.g === o.geometry)) keep.push(o);
  });

  // ---- the frame's rebuild: every vertex swung as its column's chains (blended), from its ring point
  const ang = new Float32Array(NC * 4); // the chains' swings this frame: upper x, z; lower x, z
  const rot = (x, y, z, a, b, out) => {
    // Rx(a) · Rz(b) · (x, y, z): a joint's swing (rotation order YXZ, no yaw)
    const cb = Math.cos(b), sb = Math.sin(b), ca = Math.cos(a), sa = Math.sin(a);
    const x1 = x * cb - y * sb, y1 = x * sb + y * cb;
    out[0] = x1;
    out[1] = y1 * ca - z * sa;
    out[2] = y1 * sa + z * ca;
  };
  const q = [0, 0, 0], q2 = [0, 0, 0];
  const update = () => {
    for (let k = 0; k < NC; k++) {
      const S = coat[k].segs;
      ang[k * 4] = S[0].rotation.x;
      ang[k * 4 + 1] = S[0].rotation.z;
      ang[k * 4 + 2] = S[1].rotation.x;
      ang[k * 4 + 3] = S[1].rotation.z;
    }
    for (const P of parts) {
      const pos = P.g.attributes.position, A = pos.array, n = pos.count;
      for (let v = 0; v < n; v++) {
        const i0 = P.vc[v], f = P.vf[v];
        // the column's place on the ring and its chains' swing (blended by angle between the two)
        const sn = lerp(cSin[i0], cSin[i0 + 1], f), cs = lerp(cCos[i0], cCos[i0 + 1], f), R = lerp(cR[i0], cR[i0 + 1], f);
        const ka = cA[i0], kb = cB[i0], w = lerp(cW[i0], i0 + 1 <= NCOL ? cW[i0 + 1] : cW[i0], f);
        const kA = ka * 4, kB = kb * 4;
        const a0 = lerp(ang[kA], ang[kB], w), b0 = lerp(ang[kA + 1], ang[kB + 1], w);
        const a1 = lerp(ang[kA + 2], ang[kB + 2], w), b1 = lerp(ang[kA + 3], ang[kB + 3], w);
        const L0 = lerp(cL0[i0], cL0[i0 + 1], f), d = P.depth[v], fz = P.fz[v];
        let x, y, z;
        if (d <= L0) {
          rot(0, -d, fz, a0, b0, q);
          x = q[0];
          y = q[1];
          z = q[2];
        } else {
          rot(0, -L0, 0, a0, b0, q);
          rot(0, -(d - L0), fz, a1, b1, q2);
          rot(q2[0], q2[1], q2[2], a0, b0, q2);
          x = q[0] + q2[0];
          y = q[1] + q2[1];
          z = q[2] + q2[2];
        }
        // the column's frame on the ring: +Z out (its azimuth), +X along the hips
        A[v * 3] = sn * R + cs * x + sn * z;
        A[v * 3 + 1] = DIM.coatY + y;
        A[v * 3 + 2] = cs * R - sn * x + cs * z;
      }
      pos.needsUpdate = true;
      P.g.computeVertexNormals();
    }
  };
  update();
  padRandom(RANDOM_PAD.build);
  return { coat, cloth: [{ update, meshes: keep }], keep };
}
