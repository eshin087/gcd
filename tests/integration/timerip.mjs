// The time rip in a fight sim (player/timeRip.js, ?rip=): a flurry of five run once per look on the
// suite's boss, built and stepped as main.js does (TimeRip.update before the pools and the fire field
// age; a frame of 1280 x 720 with the 5 x 8 art cell; the ASCII pass's uniforms as plain vectors).
// Shared by integ.mjs (the wyrm) and duel.mjs (a duelist); each suite hands its own build / setup.
//   const R = await timeRipCheck({ THREE, build, setup, go, frame, busy, assert, out, label, DT })
// Checks, per look: nothing throws, nothing is NaN; `off` spawns and writes nothing; every steel mark
// lies within a cell of the cut's line on screen (the tear's lips: their own offset more), a ghost's
// chest within 0.3 m of it in the world, a strip / negative band's ends within a cell of it; the band
// is at most 4 cells wide (negative 2); the screen pass is idle again within 0.25 s real of the last
// blow; the damage and the frames the blows land on are those of `off`.
// (the repo root is the suite's: process.argv[2])
import { pathToFileURL } from 'node:url';

const imp = (p) => import(pathToFileURL(`${process.argv[2]}/${p}`).href);
const TR = await imp('src/entities/player/timeRip.js');

/** Cell-space distance (5 x 8 px cells) from (x, y) to segment a-b (frame px). */
const cellDist = (x, y, ax, ay, bx, by) => {
  const X = x / 5, Y = y / 8, AX = ax / 5, AY = ay / 8, BX = bx / 5, BY = by / 8;
  const dx = BX - AX, dy = BY - AY, l2 = dx * dx + dy * dy;
  const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((X - AX) * dx + (Y - AY) * dy) / l2)) : 0;
  return Math.hypot(X - AX - dx * t, Y - AY - dy * t);
};
/** World distance from p to segment a-b. */
const segDist = (px, py, pz, s) => {
  const dx = s.bx - s.ax, dy = s.by - s.ay, dz = s.bz - s.az, l2 = dx * dx + dy * dy + dz * dz;
  const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((px - s.ax) * dx + (py - s.ay) * dy + (pz - s.az) * dz) / l2)) : 0;
  return Math.hypot(px - s.ax - dx * t, py - s.ay - dy * t, pz - s.az - dz * t);
};

export async function timeRipCheck(o) {
  const { THREE, build, setup, go, frame, busy, assert, out, label, DT } = o;
  const { TimeRip, TIME_RIP, RIP_LOOK, RIP_STAT, RIP_MODES } = TR;
  const mode0 = TIME_RIP.mode;
  const take = (mode) => {
    TIME_RIP.mode = mode;
    const G = build();
    const { game } = G;
    const V4 = () => new THREE.Vector4();
    const uni = { uCutN: { value: 0 }, uCutA: { value: [V4(), V4()] }, uCutB: { value: [V4(), V4()] }, uCutTone: { value: V4() } };
    Object.assign(game.pipeline, { width: 1280, height: 720, artCell: { x: 5, y: 8 }, camera: game.camera, asciiMat: { uniforms: uni } });
    game.camera.aspect = 16 / 9;
    game.camera.updateProjectionMatrix();
    const cam = game.camera;
    const camSync = () => { cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert(); };
    const rip = new TimeRip(game);
    game.fx.rip = rip;
    // what the rip spawns: counted while it runs (its update, its cut handler)
    let inRip = false, spawns = 0;
    const blobs = [];
    const fs = game.fx.fire.spawn.bind(game.fx.fire), as = game.fx.add.spawn.bind(game.fx.add);
    game.fx.fire.spawn = (b) => { if (inRip) { spawns++; blobs.push(b.x, b.y, b.z); } return fs(b); };
    game.fx.add.spawn = (b) => { if (inRip) spawns++; return as(b); };
    const onHit = rip._onHit.bind(rip);
    rip._onHit = (e) => { inRip = true; try { onHit(e); } finally { inRip = false; } };
    // main.js's order: the rip steps before the pools and the field age (the sims age them on game dt)
    const au = game.fx.alpha.update.bind(game.fx.alpha);
    game.fx.alpha.update = (d, t) => { camSync(); inRip = true; try { rip.update(d, game.realDt); } finally { inRip = false; } au(d, t); };
    setup(G);
    const p = game.player, d = game.dragon;
    RIP_STAT.peak = 0;
    const st0 = { ...RIP_STAT };
    const tr = { mode, hits: [], f: 0, lastF: -1, endF: -1, idleF: -1, dmg: 0, maxCell: 0, ghostM: 0, ghostN: 0, bandA: 0, bandHalf: 0, maxN: 0, nan: false, uniWrites: 0, ok: false };
    const segs = [];
    const w0 = G.watch;
    G.watch = (n, e) => {
      w0?.(n, e);
      if (n === 'player:flurryHit') {
        tr.hits.push(`${tr.f}${e.last ? '!' : ''}:${e.damage}`);
        if (e.last) tr.lastF = tr.f;
      }
      if (n === 'player:flurryEnd') tr.endF = tr.f;
    };
    const hp0 = d.hp;
    tr.ok = go(G) === true;
    const P = new THREE.Vector3();
    const proj = (x, y, z) => { P.set(x, y, z).project(cam); return [(P.x * 0.5 + 0.5) * 1280, (P.y * 0.5 + 0.5) * 720, P.z < 1]; };
    let ghosts0 = RIP_STAT.ghosts, lastN = 0;
    for (let i = 0; i < Math.round(10 / DT); i++) {
      blobs.length = 0;
      frame(G);
      tr.f++;
      camSync();
      const fl = p.flurry;
      for (let j = 0; j < (fl?.nLines | 0); j++) {
        const L = fl.lines[j];
        segs[j] = { ax: L.ax, ay: L.ay, az: L.az, bx: L.bx, by: L.by, bz: L.bz };
      }
      // the steel: each blob on screen within a cell of a cut's line (the tear's lips: their offset more)
      for (let b = 0; b < blobs.length; b += 3) {
        const [x, y, ok] = proj(blobs[b], blobs[b + 1], blobs[b + 2]);
        if (!ok) continue;
        let m = Infinity;
        for (const s of segs) {
          if (!s) continue;
          const [ax, ay] = proj(s.ax, s.ay, s.az), [bx, by] = proj(s.bx, s.by, s.bz);
          m = Math.min(m, cellDist(x, y, ax, ay, bx, by));
        }
        if (Number.isFinite(m)) tr.maxCell = Math.max(tr.maxCell, m);
        if (![blobs[b], blobs[b + 1], blobs[b + 2]].every(Number.isFinite)) tr.nan = true;
      }
      // the ghosts' chests: within 0.3 m of the line they hang on
      if (RIP_STAT.ghosts > ghosts0) {
        for (let a = 0; a < rip.ghostAnchorN; a++) {
          const x = rip.ghostAnchors[a * 3], y = rip.ghostAnchors[a * 3 + 1], z = rip.ghostAnchors[a * 3 + 2];
          let m = Infinity;
          for (const s of segs) if (s) m = Math.min(m, segDist(x, y, z, s));
          tr.ghostM = Math.max(tr.ghostM, m);
          tr.ghostN++;
        }
        ghosts0 = RIP_STAT.ghosts;
      }
      // the screen pass: finite, the band's ends on a cut's line, its width
      const n = uni.uCutN.value;
      if (!Number.isFinite(n)) tr.nan = true;
      if (n !== lastN) tr.uniWrites++;
      lastN = n;
      tr.maxN = Math.max(tr.maxN, n);
      for (let s = 0; s < n; s++) {
        const A = uni.uCutA.value[s], B = uni.uCutB.value[s];
        if (![A.x, A.y, A.z, A.w, B.x, B.y, B.z, B.w].every(Number.isFinite)) tr.nan = true;
        let m = Infinity;
        for (const g of segs) {
          if (!g) continue;
          const [ax, ay] = proj(g.ax, g.ay, g.az), [bx, by] = proj(g.bx, g.by, g.bz);
          m = Math.min(m, Math.max(cellDist(A.x, A.y, ax, ay, bx, by), cellDist(A.z, A.w, ax, ay, bx, by)));
        }
        tr.bandA = Math.max(tr.bandA, m);
        tr.bandHalf = Math.max(tr.bandHalf, B.y);
      }
      if (tr.lastF >= 0 && tr.idleF < 0 && n === 0) tr.idleF = tr.f;
      if (tr.lastF >= 0 && n > 0) tr.idleF = -1;
      if (tr.endF >= 0 && !busy(G) && !rip.busy && tr.f > tr.endF + 30) break;
    }
    G.watch = w0;
    tr.dmg = hp0 - d.hp;
    tr.spawns = spawns;
    tr.errors = RIP_STAT.errors - st0.errors;
    tr.writes = RIP_STAT.writes - st0.writes;
    tr.splits = RIP_STAT.splits - st0.splits;
    tr.ghosts = RIP_STAT.ghosts - st0.ghosts;
    tr.torn = RIP_STAT.torn - st0.torn;
    tr.peak = RIP_STAT.peak;
    tr.G = G;
    tr.errCount = [...(G.errorCounts?.values?.() ?? [])].reduce((a, b) => a + b, 0);
    return tr;
  };
  const R = {};
  try {
    for (const m of RIP_MODES) R[m] = take(m);
  } finally {
    TIME_RIP.mode = mode0;
  }
  const off = R.off;
  for (const m of RIP_MODES) {
    const r = R[m];
    const idleS = r.idleF >= 0 && r.lastF >= 0 ? (r.idleF - r.lastF) * DT : NaN;
    out(`   ${label} ${m}: blows ${r.hits.join(' ')} · damage ${r.dmg} · rip spawns ${r.spawns} (steel peak ${r.peak}) · splits ${r.splits} · ghosts ${r.ghosts} (torn ${r.torn}) · screen cuts ${r.maxN}, half ${r.bandHalf} · steel ≤ ${r.maxCell.toFixed(2)} cells off the line · ghost chests ≤ ${r.ghostM.toFixed(3)} m · band ends ≤ ${r.bandA.toFixed(2)} cells · idle ${Number.isFinite(idleS) ? idleS.toFixed(3) : '-'} s after the last blow`);
    assert(r.ok && r.hits.length === 5 && r.endF >= 0, `${label} ${m}: a flurry of five runs to its end (${r.hits.length} blows)`);
    assert(r.errors === 0 && r.errCount === 0 && !r.nan, `${label} ${m}: nothing throws, nothing NaN (${r.errors} rip errors, ${r.errCount} module errors)`);
    assert(r.dmg === off.dmg && r.hits.join(' ') === off.hits.join(' '), `${label} ${m}: the damage (${r.dmg}) and the frames the blows land on are those of off (${off.hits.join(' ')})`);
  }
  assert(off.spawns === 0 && off.writes === 0 && off.uniWrites === 0 && off.maxN === 0, `${label} off: nothing spawned (${off.spawns}), nothing written (${off.writes} writes)`);
  const tearOff = Math.max(...RIP_LOOK.tear.frames.map((f) => f.off));
  assert(R.tear.splits >= 4 && R.tear.spawns > 0 && R.tear.maxCell <= tearOff + 1, `${label} tear: ${R.tear.splits} splits, every steel cell within ${tearOff + 1} cells of its line (the lips at most ${tearOff} off it: ${R.tear.maxCell.toFixed(2)})`);
  assert(R.strip.spawns > 0 && R.strip.maxCell <= 1 && R.strip.maxN >= 1 && R.strip.bandA <= 1 && 2 * R.strip.bandHalf + 1 <= 4, `${label} strip: the seam within a cell of the line (${R.strip.maxCell.toFixed(2)}), the band's ends on it (${R.strip.bandA.toFixed(2)} cells), at most ${2 * R.strip.bandHalf + 1} cells wide`);
  assert(R.negative.spawns === 0 && R.negative.maxN >= 1 && R.negative.bandA <= 1 && 2 * R.negative.bandHalf + 0.5 <= 2, `${label} negative: the band's ends on the line (${R.negative.bandA.toFixed(2)} cells), at most 2 cells wide (half ${R.negative.bandHalf}), no steel`);
  assert(R.ghosts.ghosts >= 4 && R.ghosts.ghostN > 0 && R.ghosts.ghostM <= 0.3 && R.ghosts.torn > 0 && R.ghosts.maxN === 0, `${label} ghosts: ${R.ghosts.ghosts} copies, their chests ≤ ${R.ghosts.ghostM.toFixed(3)} m off the line, ${R.ghosts.torn} letters torn off, no screen pass`);
  for (const m of ['strip', 'negative']) {
    const r = R[m], idleS = (r.idleF - r.lastF) * DT;
    assert(r.idleF >= 0 && idleS <= 0.25, `${label} ${m}: the screen pass is idle ${idleS.toFixed(3)} s after the last blow (<= 0.25)`);
  }
  return R;
}
