// THE STANCE AUDIT (opt-in, not part of `npm test`): every pose of a move style measured the way the
// hero suites measure, so a style's author can act on numbers instead of a feeling.
//
//   node tests/audit/hero-stance.mjs . <styleId> [--quick]
//
// It runs the integration harness (tests/integration/integ.mjs, the `herostyles` scenario with
// ABYSS_STANCE_AUDIT=<styleId>) and prints one table: every pose of each set, pinned (standing 6 s,
// then turned four ways); every cross-fade between two poses of a set; every idle action of the style
// in each set it names; and, out of each pose, the transitions (run / strafe / backpedal start and
// stop, a light, a block, a roll, a drink). Measured in HIS OWN frame (the camera lean off; points in
// the root's frame are model metres):
//   kink    the sword wrist: forearm vs blade (deg, mean / max)
//   elbow   interior angle, sword R / free L (deg, min-max); knee the same (R / L)
//   hand    the free hand's palm and fingertip into the waist / hips / sword forearm / hood (cm, + = in)
//   blade   the drawn steel's least gap to his body, hood and legs (cm, − = inside), and the frames it
//           crosses a coat panel
//   flat    the blade's flat to the game camera, at worst of four facings (0..1)
//   tip     the point's lowest height (m)
//   fast    the fastest frame of the grip / the point / the free hand / the head / each elbow / the
//           feet (cm a frame), and the most an arm segment or the free hand turns in a frame (deg),
//           WHERE it happened (the clip and its time)
//   steps   steps the feet took
// Anything past the bounds the hero suites hold (HEROSTANCE, HEROARMS, HEROHAND, HEROLIFE, HEROLOOK
// and the brief's) is flagged at the row's end with what to look at.
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------- the bounds (flags)
export const BOUNDS = {
  kinkMean: 10, kinkMax: 16, // HEROSTANCE: through a stance's life
  elbowMin: 39.5, elbowMax: 166, // ADR-078: the solver holds 40 (below: something fights it); HEROARMS: never locks (166)
  kneeMin: 31.5, // the solver's LEG_FOLD 32 (the roll's tuck sits on it)
  hand: 1.5, // cm into the body (HEROHAND H4, HEROSTANCE)
  bladeHeld: 8, // cm of visible gap from body / hood / legs in a HELD pose (the brief: 8-10)
  bladeMove: 0, // cm: through transitions the steel never goes in (HEROLOOK allows 2)
  flat: 0.25, // HEROSTANCE (at ease 0.25, in the guard 0.3)
  tip: 0.03, // m: the point above the grass
  pointStill: 1, // cm a frame, the point standing (HEROSTANCE S3)
  pointFade: 2, // cm a frame of any tracked point through a cross-fade between two poses
  pointMove: 8, // cm a frame of the point on run / strafe / backpedal starts and stops (HEROSTANCE S4)
  pointClip: 60, // cm a frame in the first 0.2 s of a roll / a backstep / a light / a block / a drink (HEROSTANCE S4)
  turn: 60, // deg a frame of an arm segment or the free hand (HEROLIFE)
};

/** The audit itself, run INSIDE the harness (integ.mjs's herostyles with ABYSS_STANCE_AUDIT). */
export async function runAudit(H) {
  const { build, run, heroShapes, coatCrossOf, THREE, imp, out, DT, CONFIG, styleId, quick } = H;
  const STY = await imp('src/entities/player/styles/index.js');
  const { listOf, SET_NAMES } = await imp('src/entities/player/stances.js');
  const { FIDGET_NAMES } = await imp('src/entities/player/anim.js');
  const { DIM: HD, BODY, sheetOffset } = await imp('src/entities/player/model.js');
  if (!STY.STYLES[styleId]) {
    out(`unknown style '${styleId}' (${STY.STYLE_IDS.join(' | ')})`);
    return null;
  }
  const style = STY.STYLES[styleId];
  STY.setStanceStyle(styleId);
  const G = build();
  const { game, input } = G;
  run(G, 0.3);
  game.flow.debug.toState('explore');
  game.dragon.update = () => {}; // (the wyrm held asleep: the flow's fight would take the stance over)
  const p = game.player, r = p.rig, A = p.anim, pd = p.debug;
  pd.god = true;
  pd.infiniteFlasks = true;
  p.lean.on = false;
  const LANE = [-10, 13];
  const home = () => { p.debug.teleport(LANE[0], LANE[1]); };
  home();
  const aim = { x: 0, z: -60 };
  const DEG = 180 / Math.PI;
  const { ell, cap, shell } = heroShapes(BODY, HD);
  const tipLen = HD.drawnTip ?? HD.steelTip;
  const camDir = new THREE.Vector3(0, Math.sin(CONFIG.camera.pitch), Math.cos(CONFIG.camera.pitch));
  const v = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Quaternion(), inv = new THREE.Matrix4();
  // the body for the blade (sword-forearm out: the blade's base sits in the gauntlet; the free arm in)
  const bodyParts = [
    ['torso', r.spine, (o) => shell(o)],
    ['hips', r.pelvis, (o) => ell(o, BODY.hips.c, BODY.hips.r)],
    ['hood', r.head, (o) => ell(o, BODY.head.c, BODY.head.r.map((x) => x + 0.03))],
    ['L upper arm', r.arms.L.upper, (o) => cap(o, 0, HD.upperArm, BODY.upperArm[0], BODY.upperArm[1])],
    ['L forearm', r.arms.L.fore, (o) => cap(o, 0, HD.foreArm - 0.06, BODY.foreArm[0], BODY.foreArm[1])],
    ['R upper arm', r.arms.R.upper, (o) => cap(o, 0, HD.upperArm, BODY.upperArm[0], BODY.upperArm[1])],
    ...['R', 'L'].flatMap((s) => [
      [`thigh ${s}`, r.legs[s].thigh, (o) => cap(o, 0, HD.thigh, BODY.thigh[0], BODY.thigh[1])],
      [`shin ${s}`, r.legs[s].shin, (o) => cap(o, -0.02, HD.shin - 0.04, BODY.shin[0], BODY.shin[1])],
    ]),
  ];
  // the body for the free hand (as HEROHAND H4)
  const handParts = [
    ['waist', r.spine, (o) => shell(o)],
    ['hips', r.pelvis, (o) => ell(o, BODY.hips.c, BODY.hips.r)],
    ['hood', r.head, (o) => ell(o, BODY.head.c, BODY.head.r.map((x) => x + 0.03))],
    ['sword forearm', r.arms.R.fore, (o) => cap(o, 0, HD.foreArm - 0.06, BODY.foreArm[0], BODY.foreArm[1])],
  ];
  const kink = () => {
    v.set(0, -1, 0).applyQuaternion(r.arms.R.fore.getWorldQuaternion(q));
    w.set(0, 0, 1).applyQuaternion(r.sword.getWorldQuaternion(q));
    return Math.acos(Math.max(-1, Math.min(1, v.normalize().dot(w.normalize())))) * DEG;
  };
  const elbow = (s) => 180 - Math.abs(r.arms[s].fore.rotation.x) * DEG;
  const knee = (s) => 180 - Math.abs(r.legs[s].shin.rotation.x) * DEG;
  const where = () => `${A.key}${p.atk?.def ? ' ' + (p.atk.def.name ?? p.atk.def.kind) : ''}${A.fidget.k >= 0 ? ' ' + A.fidget.name : ''} t ${(p.atk?.def ? p.atk.t : A.t).toFixed(2)}`;
  // the tracked points (root frame, model m) and segments (body frame)
  const PTS = ['grip', 'point', 'hand', 'head', 'elbow R', 'elbow L', 'foot R', 'foot L'];
  const ptNow = PTS.map(() => new THREE.Vector3()), ptWas = PTS.map(() => new THREE.Vector3());
  const SEGS = ['R upper', 'R fore', 'L upper', 'L fore', 'L hand'];
  const sgNow = SEGS.map(() => new THREE.Vector3()), sgWas = SEGS.map(() => new THREE.Vector3());
  const e0 = new THREE.Vector3(), e1 = new THREE.Vector3(), invB = new THREE.Matrix4();
  const sample = () => {
    inv.copy(p.object3d.matrixWorld).invert();
    ptNow[0].setFromMatrixPosition(r.sword.matrixWorld).applyMatrix4(inv);
    ptNow[1].set(0, 0, tipLen).applyMatrix4(r.sword.matrixWorld).applyMatrix4(inv);
    ptNow[2].set(0, -HD.foreArm, 0).applyMatrix4(r.arms.L.fore.matrixWorld).applyMatrix4(inv);
    ptNow[3].setFromMatrixPosition(r.head.matrixWorld).applyMatrix4(inv);
    ptNow[4].setFromMatrixPosition(r.arms.R.fore.matrixWorld).applyMatrix4(inv);
    ptNow[5].setFromMatrixPosition(r.arms.L.fore.matrixWorld).applyMatrix4(inv);
    ptNow[6].setFromMatrixPosition(r.legs.R.foot.matrixWorld).applyMatrix4(inv);
    ptNow[7].setFromMatrixPosition(r.legs.L.foot.matrixWorld).applyMatrix4(inv);
    invB.copy(r.body.matrixWorld).invert();
    [r.arms.R, r.arms.L].forEach((arm, k) => {
      e0.setFromMatrixPosition(arm.upper.matrixWorld).applyMatrix4(invB);
      e1.setFromMatrixPosition(arm.fore.matrixWorld).applyMatrix4(invB);
      sgNow[k * 2].subVectors(e1, e0).normalize();
      e0.set(0, -HD.foreArm, 0).applyMatrix4(arm.fore.matrixWorld).applyMatrix4(invB);
      sgNow[k * 2 + 1].subVectors(e0, e1).normalize();
    });
    e0.setFromMatrixPosition(r.arms.L.wrist.matrixWorld).applyMatrix4(invB);
    e1.setFromMatrixPosition(r.arms.L.point.matrixWorld).applyMatrix4(invB);
    sgNow[4].subVectors(e1, e0).normalize();
  };

  /** A fresh record for one row. */
  const rec = (label, kind) => ({
    label, kind, n: 0, kSum: 0, kMax: 0, eR: [180, 0], eL: [180, 0], kR: [180, 0], kL: [180, 0],
    hand: -1, handAt: '', blade: Infinity, bladeAt: '', coat: 0, flat: 9, tip: Infinity,
    fast: PTS.map(() => 0), fastAt: PTS.map(() => ''), turn: 0, turnAt: '', steps: 0, bad: 0, lk: [false, false], first: true,
    // (a clip's row: the fastest frames of its ENTRY only, its first 0.2 s: the cut itself is meant to be fast)
    fastFrames: kind === 'clip' ? Math.round(0.2 / DT) + 1 : Infinity,
  });
  /** One frame into R (after the tick). `held`: the frame counts as a held pose (the blade gap's bound). */
  const frame = (R) => {
    R.n++;
    if (!A.cur.every(Number.isFinite)) R.bad++;
    const k = kink();
    R.kSum += k;
    R.kMax = Math.max(R.kMax, k);
    for (const [s, E, K] of [['R', R.eR, R.kR], ['L', R.eL, R.kL]]) {
      const e = elbow(s), kk = knee(s);
      E[0] = Math.min(E[0], e);
      E[1] = Math.max(E[1], e);
      K[0] = Math.min(K[0], kk);
      K[1] = Math.max(K[1], kk);
    }
    if (A.cur[45] < 0.05) {
      for (const tipPt of [false, true]) {
        if (tipPt) v.setFromMatrixPosition(r.arms.L.point.matrixWorld);
        else v.set(0, -HD.foreArm, 0).applyMatrix4(r.arms.L.fore.matrixWorld);
        for (const [name, J, f] of handParts) {
          const d = f(J.worldToLocal(w.copy(v)));
          if (d > R.hand) { R.hand = d; R.handAt = `${tipPt ? 'fingertip' : 'palm'} in the ${name}, ${where()}`; }
        }
      }
    }
    for (let z = 0.2; z <= tipLen + 1e-6; z += 0.05) {
      v.set(0, 0, z).applyMatrix4(r.sword.matrixWorld);
      for (const [name, J, f] of bodyParts) {
        if (name.startsWith('L ') && A.cur[45] > 0.05) continue; // (on the grip the free hand holds the steel)
        const g = -f(J.worldToLocal(w.copy(v)));
        if (g < R.blade) { R.blade = g; R.bladeAt = `${name}, ${where()}`; }
      }
    }
    if (coatCrossOf(r, tipLen, sheetOffset, v, w)) R.coat++;
    v.set(0, 0, tipLen).applyMatrix4(r.sword.matrixWorld);
    R.tip = Math.min(R.tip, v.y - p.position.y);
    sample();
    if (!R.first && R.n <= R.fastFrames) {
      for (let i = 0; i < PTS.length; i++) {
        const d = ptNow[i].distanceTo(ptWas[i]);
        if (d > R.fast[i]) { R.fast[i] = d; R.fastAt[i] = where(); }
      }
      for (let i = 0; i < SEGS.length; i++) {
        const t = Math.acos(Math.max(-1, Math.min(1, sgNow[i].dot(sgWas[i])))) * DEG;
        if (t > R.turn) { R.turn = t; R.turnAt = `${SEGS[i]}, ${where()}`; }
      }
    }
    for (let i = 0; i < PTS.length; i++) ptWas[i].copy(ptNow[i]);
    for (let i = 0; i < SEGS.length; i++) sgWas[i].copy(sgNow[i]);
    R.first = false;
    A.feet.forEach((Ft, i) => {
      if (Ft.lock && !R.lk[i] && R.n > 1) R.steps++;
      R.lk[i] = Ft.lock;
    });
  };
  const go = (sec, R, before) => {
    for (let i = 0, n = Math.round(sec / DT); i < n; i++) {
      before?.(i);
      game.mouseGround.set(p.position.x + aim.x, 0, p.position.z + aim.z);
      G.tick(DT);
      if (R) frame(R);
    }
  };
  const flatFour = (R) => {
    for (const [ax, az] of [[0, -60], [0, 60], [60, 0], [-60, 0]]) {
      aim.x = ax;
      aim.z = az;
      go(0.9);
      w.set(0, 1, 0).applyQuaternion(r.sword.getWorldQuaternion(q));
      R.flat = Math.min(R.flat, Math.abs(w.dot(camDir)));
    }
    aim.x = 0;
    aim.z = -60;
    go(0.9);
  };
  const calmDown = () => {
    input.axis = { x: 0, y: 0 };
    for (let i = 0; i < 600 && (p.state !== 'idle' || A.key !== 'loco'); i++) go(DT);
  };
  const pin = (set, id) => {
    pd.stance.ease = pd.stance.fight = null;
    pd.fightStance = set === 'fight';
    pd.stance[set] = id;
    go(0.2);
    const S = A.stanceSel[set];
    for (let i = 0; i < 600 && (S.k < 1 || S.cur?.id !== id); i++) go(DT);
    go(1.2);
  };
  const rows = [];
  const wait0 = A.fidget.wait;
  const noLife = (on) => { A.fidget.wait = on ? 1e9 : wait0; };

  for (const set of SET_NAMES) {
    const list = listOf(style, set);
    // (1) each pose, held
    for (const S of list) {
      noLife(true);
      home();
      pin(set, S.id);
      const R = rec(`${set} ${S.id}`, 'held');
      go(quick ? 3 : 6, R);
      flatFour(R);
      rows.push(R);
    }
    // (2) every cross-fade (a → b) of the set
    if (list.length > 1) {
      for (const a of list) {
        for (const b of list) {
          if (a === b) continue;
          noLife(true);
          home();
          pin(set, a.id);
          const R = rec(`${set} fade ${a.id} → ${b.id}`, 'fade');
          pd.stance[set] = b.id;
          const fade = Number.isFinite(style?.shift?.fade) ? style.shift.fade : 1.2;
          go(fade + 0.8, R);
          rows.push(R);
          if (quick) break;
        }
      }
    }
    // (3) the idle actions that may play in this set (from the first pose)
    const own = Array.isArray(style.fidgets) && style.fidgets.length ? style.fidgets : null;
    const names = own ? own.filter((D) => (Array.isArray(D.sets) ? D.sets.includes(set) : set === 'ease')).map((D) => D.name) : set === 'ease' ? FIDGET_NAMES : [];
    for (const name of names) {
      noLife(true);
      home();
      pin(set, list[0].id);
      const R = rec(`${set} ${list[0].id} + idle ${name}`, 'fidget');
      const ok = A.debug.fidget(name);
      go(0.1, R);
      for (let i = 0; i < 900 && A.fidget.k >= 0; i++) go(DT, R);
      if (!ok) R.label += ' (NOT STARTED)';
      rows.push(R);
    }
    // (4) the transitions out of each pose
    for (const S of list) {
      const T = [
        ['run', () => { input.axis = { x: 0, y: 1 }; aim.x = 0; aim.z = -60; }, 0.9, 1.2],
        ['strafe', () => { input.axis = { x: 1, y: 0 }; aim.x = 0; aim.z = -60; }, 0.9, 1.2],
        ['backpedal', () => { input.axis = { x: 0, y: -1 }; aim.x = 0; aim.z = -60; }, 0.9, 1.2],
        ['light', () => { input.click(0); }, 0, 1.3],
        ['block', () => { input.press(1); }, 0.6, 0.9, () => input.up(1)],
        ['roll', () => { input.axis = { x: 0, y: 1 }; input.tap('Space'); }, 0.2, 1.2],
        ['heal', () => { input.tap('KeyF'); }, 0, 1.8],
      ];
      for (const [name, start, hold, after, end] of T) {
        noLife(true);
        home();
        pin(set, S.id);
        const R = rec(`${set} ${S.id} → ${name}`, ['light', 'roll', 'block', 'heal'].includes(name) ? 'clip' : 'move');
        start();
        go(hold, R);
        end?.();
        input.axis = { x: 0, y: 0 };
        go(after, R);
        calmDown();
        rows.push(R);
        if (quick && name === 'strafe') break;
      }
    }
  }
  pd.stance.ease = pd.stance.fight = null;
  pd.fightStance = null;
  noLife(false);
  p.lean.on = true;

  // ---------------------------------------------------------------- the table
  const B = BOUNDS, cm = (x) => (x * 100).toFixed(1);
  out(`\n== STANCE AUDIT: ${styleId} (${style.label}) · ${rows.length} rows · bounds: tests/audit/hero-stance.mjs BOUNDS ==`);
  out('row | kink mean/max ° | elbow R / L ° | knee R / L ° | hand cm | blade cm (coat f) | flat | tip m | fastest cm/f: grip point hand head elbR elbL footR footL | turn °/f | steps | flags');
  let flagged = 0;
  for (const R of rows) {
    const km = R.kSum / Math.max(1, R.n), F = [];
    const still = R.kind === 'held';
    if (still && (km > B.kinkMean || R.kMax > B.kinkMax)) F.push(`kink ${km.toFixed(1)}/${R.kMax.toFixed(1)}° (≤ ${B.kinkMean}/${B.kinkMax}: the forearm off the blade's line; move rP or swD)`);
    if (R.eR[0] < B.elbowMin || R.eL[0] < B.elbowMin) F.push(`an elbow folds to ${Math.min(R.eR[0], R.eL[0]).toFixed(0)}° (< ${B.elbowMin}: a hand too near its shoulder)`);
    if (R.eR[1] > B.elbowMax || R.eL[1] > B.elbowMax) F.push(`an elbow locks at ${Math.max(R.eR[1], R.eL[1]).toFixed(0)}° (> ${B.elbowMax}: a hand past the arm's reach)`);
    if (R.kR[0] < B.kneeMin || R.kL[0] < B.kneeMin) F.push(`a knee folds to ${Math.min(R.kR[0], R.kL[0]).toFixed(0)}°`);
    if (R.hand * 100 > B.hand) F.push(`free hand ${cm(R.hand)} cm in (${R.handAt})`);
    const bladeB = still ? B.bladeHeld : B.bladeMove;
    if (R.blade * 100 < bladeB && (still || R.kind !== 'clip')) F.push(`blade gap ${cm(R.blade)} cm (< ${bladeB}: ${R.bladeAt})`);
    if (still && R.coat > 0.05 * R.n) F.push(`blade through the coat on ${R.coat} of ${R.n} frames`);
    if (still && R.flat < B.flat) F.push(`flat ${R.flat.toFixed(2)} to the camera (< ${B.flat}: edge-on from one side; turn swF)`);
    if (R.tip < B.tip) F.push(`point ${R.tip.toFixed(3)} m (in the grass)`);
    const pt = R.fast[1] * 100;
    const pb = R.kind === 'held' ? B.pointStill : R.kind === 'fade' ? B.pointFade : R.kind === 'move' ? B.pointMove : B.pointClip;
    const worstPt = R.kind === 'fade' || R.kind === 'held' ? Math.max(...R.fast) * 100 : pt;
    if (worstPt > pb) {
      const i = R.kind === 'fade' || R.kind === 'held' ? R.fast.indexOf(Math.max(...R.fast)) : 1;
      F.push(`${PTS[i]} ${(R.fast[i] * 100).toFixed(1)} cm a frame (> ${pb}; ${R.fastAt[i]})`);
    }
    if (R.turn > B.turn) F.push(`${R.turnAt} turns ${R.turn.toFixed(0)}° a frame (> ${B.turn})`);
    if (R.bad) F.push(`${R.bad} frames with a non-finite pose channel`);
    if (F.length) flagged++;
    out(`${R.label} | ${km.toFixed(1)}/${R.kMax.toFixed(1)} | ${R.eR[0].toFixed(0)}-${R.eR[1].toFixed(0)} / ${R.eL[0].toFixed(0)}-${R.eL[1].toFixed(0)} | ${R.kR[0].toFixed(0)}-${R.kR[1].toFixed(0)} / ${R.kL[0].toFixed(0)}-${R.kL[1].toFixed(0)} | ${cm(R.hand)} | ${cm(R.blade)} (${R.coat}) | ${R.flat < 9 ? R.flat.toFixed(2) : '-'} | ${R.tip.toFixed(2)} | ${R.fast.map((x) => (x * 100).toFixed(1)).join(' ')} | ${R.turn.toFixed(0)} | ${R.steps} | ${F.length ? 'FLAG ' + F.join('; ') : 'ok'}`);
  }
  out(`\n${flagged} of ${rows.length} rows flagged${flagged ? ' (the flag says what to look at; the where: the clip and its time)' : ''}. Compare with today's rows (node tests/audit/hero-stance.mjs . today): some flags are today's own.`);
  return G;
}

// ---------------------------------------------------------------- the command line
if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  const root = path.resolve(process.argv[2] ?? '.');
  const styleId = process.argv[3];
  if (!styleId) {
    process.stdout.write('usage: node tests/audit/hero-stance.mjs <repoRoot> <styleId> [--quick]\n');
    process.exit(2);
  }
  const res = spawnSync(process.execPath, [path.join(root, 'tests/integration/integ.mjs'), root, 'herostyles'], {
    stdio: 'inherit',
    env: { ...process.env, ABYSS_STANCE_AUDIT: styleId, ABYSS_STANCE_QUICK: process.argv.includes('--quick') ? '1' : '' },
  });
  process.exit(res.status ?? 1);
}
export const AUDIT_URL = pathToFileURL(SELF).href;
