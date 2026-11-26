import { TELL, TELL_STYLE } from './rules.js';
import { axes } from './clashFx.js';
import { FIRE_KIND } from '../render/firePalettes.js';

// THE TELL MARK (ADR-224): a short mark printed over a boss's head from the START of the windup of a
// blow the hero must answer one way: blue (parry), red (dodge), black (dodge: a charged blow). It is
// gone before the blow's own cue (the white glint / the flare, `lead` s before the impact) and before
// the impact itself. Normal (white) blows get none. One module for every boss: it listens to the one
// event every attacker already sends at a windup's start, `combat:tell` (the wyrm: dragon.announceTell;
// the duelists: brain._announce; Wen Yao's paper copies: clones.js, `clone: true`, the mark rides the
// copy). Hazards (`hazard`, `bullet`, `brood`: what lands away from the boss) and the world's own
// tells (`source: 'world'`) are left out: they warn on the ground where they land.
// It reads, it never writes: nothing here changes a timing, a window or a rule (tests: tellmark.mjs).
//
// How it is drawn (STYLE.md "The fire field", the impact stamp's way, combat/impactStamp.js): steel
// written on the letter grid, one blob per cell, snapped to the cell's centre, so a column of cells
// prints '|', a diagonal '/' '\', a hot cell a white digit; re-drawn every frame with one copy alive
// (a one-copy frame clock); dyed in the flare's own colour (TELL_STYLE[tell].flare.tint) on black
// cells (fireField.tint, `dark`), never over the hero. Its size is whole letter cells, so it reads the
// same at 720p, 1080p and on a phone (a cell is the same handful of pixels on each).
// The count says the answer, the colour says it again: ONE mark = parry, TWO = dodge.
//
// The looks (?tellMark=, the Lab's 'tellMark' button; the owner picks, the rest stay behind the switch):
//   bang     '!' over his head (a column of '|' over a hot digit); a dodge is '!!'
//   chevron  a 'V' pointing down at him ('\' '/' to a hot tip); a dodge is two, stacked
//   diamond  a small diamond of strokes round a hot heart; a dodge rings it with a second, wider one
//   off      none (the fights as before)

const fin = (v) => Number.isFinite(v);
const K_STEEL = FIRE_KIND.steel;
const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

export const TELL_MARK_LOOKS = ['bang', 'chevron', 'diamond', 'off'];
/** The default look (ADR-224; the owner picks among the three, the default follows their pick). */
export const TELL_MARK_DEFAULT = 'bang';

/**
 * The numbers (game seconds, metres, letter cells):
 *   lead     the mark is gone this long before the impact: before the blow's own timing cue (the
 *            glint / the flare, flashLead 0.26 - 0.35 s before it). The mark says WHAT to do, the
 *            cue says WHEN. A windup too short for that keeps it `minShow` s, or `short` of its time
 *            if that is less: it is always gone before the impact
 *   fade     s it dims over at its end; `pop` s it stands one cell taller as it appears
 *   over     m above the top of the head sphere it hangs (a human; the wyrm x `wyrm`), `gap` cells more
 *   selfHead m over a paper copy's chest sphere its head's top is (its mark rides the copy); `cloneY`
 *            m over the ground when the copy is gone
 *   k        the size in cells (x `wyrmK` for the wyrm: his letters are his own, he is big)
 *   heat     the steel: `line` a stroke, `hot` a heart (a digit), `dim` the outer ring; `rise` how much
 *            hotter it grows toward its end
 *   pull     m toward the camera (past the fire field's soft depth fade)
 *   minY     m: no cell lower than this (the field's soft depth fade near the floor)
 *   margin   of the frame's width / height: a mark is moved inside the frame by this much at least
 *   px       a blob's width (frame px at a 5 px cell)
 *   ink      fireField.tint: `dark` (the black behind each letter), `pad` (the zone is drawn wider), the
 *            zones' ids (`id` + the slot; the flares take 1..100000, the stamp 800001, the charge 900000+)
 *   spare    the hero is never printed over (as the stamp: an ellipse round his figure on screen)
 */
export const TELL_MARK = deepFreeze({
  lead: 0.36,
  minShow: 0.2,
  short: 0.6,
  fade: 0.08,
  pop: 0.06,
  over: 0.15,
  gap: 2,
  wyrm: 2.2,
  wyrmK: 1.5,
  cloneY: 1.9,
  selfHead: 0.62,
  heat: { line: 0.95, hot: 1.24, dim: 0.7, rise: 0.12 },
  pull: 1.5,
  px: 12,
  minY: 0.7,
  margin: [0.03, 0.04],
  ink: { dark: 1, pad: 1.5, id: 810001 },
  spare: { rx: 0.24, foot: 0.05, head: 1.7, pad: 0.04 },
});

// ---- the switch (?tellMark=), read when a mark is raised
let look = (() => {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('tellMark') : null;
    return TELL_MARK_LOOKS.includes(q) ? q : TELL_MARK_DEFAULT;
  } catch {
    return TELL_MARK_DEFAULT;
  }
})();
export const tellMarkLook = () => look;
export const setTellMarkLook = (m) => {
  look = TELL_MARK_LOOKS.includes(m) ? m : TELL_MARK_DEFAULT;
  if (look === 'off') tellMarkClear();
};

/** Does this tell raise a mark? A boss's own blow (or a paper copy's) that one answer meets: blue,
 *  red, black. */
export const marksTell = (e) =>
  !!e && typeof e === 'object' && e.source === 'dragon' && !e.hazard && !e.bullet && !e.brood && (e.tell === TELL.BLUE || e.tell === TELL.RED || e.tell === TELL.BLACK);
/** How many marks the answer is: 1 parry (blue), 2 dodge (red, black). */
export const markCount = (tell) => (tell === TELL.BLUE ? 1 : 2);
/** When (game s after the tell) a mark of a blow `impactIn` s away is gone: before its timing cue when
 *  the windup allows (TELL_MARK.lead), always before the impact. */
export const markEnd = (impactIn) => {
  const L = TELL_MARK, T = fin(impactIn) && impactIn > 0 ? impactIn : 0.05;
  return Math.max(T - L.lead, Math.min(T * L.short, L.minShow));
};

// ---- the marks alive: the boss's (one: a new tell of his replaces it) and the paper copies'
const POOL = 4;
const marks = Array.from({ length: POOL }, (_, i) => ({ alive: false, slot: i, clone: false, self: null, tell: TELL.RED, look: 'bang', age: 0, end: 1, x: 0, z: 0, k: 1, wyrm: false }));
/** What the last raised mark was (tests, the Lab): its tell, look, end; counts since the load; the
 *  last drawn mark's blobs and where it stood (frame px, origin bottom-left: its lowest centre cell). */
export const TELL_MARK_LAST = { tell: '', look: '', end: 0, impactIn: 0, clone: false, raised: 0, drawn: 0, blobs: 0, px: NaN, py: NaN };

/** Raise the mark for tell event `e` (combat:tell). Returns the mark, or null. Never throws. */
export function tellMarkRaise(game, e) {
  try {
    if (look === 'off' || !marksTell(e)) return null;
    const clone = !!e.clone;
    let M = null;
    if (!clone) M = marks[0];
    else {
      for (let i = 1; i < POOL; i++) {
        if (!marks[i].alive) {
          M = marks[i];
          break;
        }
        if (!M || marks[i].age > M.age) M = marks[i];
      }
    }
    M.alive = true;
    M.clone = clone;
    M.tell = e.tell;
    M.look = look;
    M.age = 0;
    M.end = markEnd(e.impactIn);
    M.x = fin(e.x) ? e.x : 0;
    M.z = fin(e.z) ? e.z : 0;
    M.wyrm = !clone && isWyrm(game?.dragon);
    // a paper copy's mark rides that copy (Wen Yao's FoxClones: the self nearest the cue)
    M.self = null;
    if (clone) {
      let bd = Infinity;
      const list = game?.dragon?.clones?.list;
      if (Array.isArray(list)) {
        for (const c of list) {
          if (!c?.alive || !fin(c.x + c.z)) continue;
          const dd = (c.x - M.x) ** 2 + (c.z - M.z) ** 2;
          if (dd < bd) {
            bd = dd;
            M.self = c;
          }
        }
      }
    }
    M.k = M.wyrm ? TELL_MARK.wyrmK : 1;
    const L = TELL_MARK_LAST;
    L.tell = M.tell;
    L.look = M.look;
    L.end = M.end;
    L.impactIn = fin(e.impactIn) ? e.impactIn : 0;
    L.clone = clone;
    L.raised++;
    return M;
  } catch {
    return null;
  }
}

/** The marks alive now (read-only use: tests, the Lab). */
export const tellMarks = () => marks;

/** Drop every mark (a stagger, a posture break, a death, a reset, the look turned off). */
export function tellMarkClear() {
  for (const M of marks) {
    M.alive = false;
    M.self = null;
  }
  deadline = -1;
}

let wired = null;
/** Subscribe to the game's events (once per game). */
export function tellMarkInit(game) {
  const ev = game?.events;
  if (!ev?.on || wired === game) return;
  wired = game;
  ev.on('combat:tell', (e) => tellMarkRaise(game, e));
  // a windup cut short: no blow comes
  for (const name of ['dragon:stagger', 'dragon:postureBreak', 'dragon:death', 'game:retry']) ev.on(name, () => tellMarkClear());
  ev.on('state', (e) => {
    const to = e?.to;
    if (to === 'title' || to === 'dead' || to === 'victory' || (to === 'explore' && e?.from !== 'paused')) tellMarkClear();
  });
}

// ---- where the mark hangs
// (the wyrm's rig names its points, rig.pt; a duelist's rig is bones)
const isWyrm = (d) => !!d?.rig?.pt?.head;
const HEAD = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
/**
 * The point the mark's lowest cell stands on (world), into HEAD; false when there is none. A duelist
 * is DRAWN leaned up the screen and scaled (his `drawnPoint`, Player.leanPoint's twin): the top of his
 * head sphere goes through it, so the mark sits over the head as it is drawn, not as it stands.
 */
function anchor(game, M) {
  const d = game?.dragon;
  if (M.clone) {
    // a paper copy: over its chest sphere by `selfHead` (its head), drawn as its maker draws a point on
    // it (Wen Yao's drawnPoint leans and scales about the nearest body); without one, at `cloneY`
    const c = M.self, h = c?.alive ? c.hs?.[0] : null;
    if (h && fin(h.x + h.y + h.z)) HEAD.set(h.x, h.y + TELL_MARK.selfHead, h.z);
    else HEAD.set(M.x, TELL_MARK.cloneY, M.z);
    if (typeof d?.drawnPoint === 'function') d.drawnPoint(HEAD);
    if (!fin(HEAD.x + HEAD.y + HEAD.z)) return false;
    HEAD.y += TELL_MARK.over;
    return true;
  }
  if (!d) return false;
  // the head sphere (actor contract: hurtSpheres, part 'head'): the highest one
  let best = null;
  const hs = d.hurtSpheres;
  if (Array.isArray(hs)) for (const s of hs) if (s?.part === 'head' && fin(s.x + s.y + s.z) && (!best || s.y > best.y)) best = s;
  const over = TELL_MARK.over * (M.wyrm ? TELL_MARK.wyrm : 1);
  if (best) HEAD.set(best.x, best.y + (fin(best.r) ? best.r : 0.2), best.z);
  else {
    const p = d.position;
    if (!p || !fin(p.x + p.z)) return false;
    HEAD.set(p.x, (fin(p.y) ? p.y : 0) + (M.wyrm ? 6 : 1.8), p.z);
  }
  if (typeof d.drawnPoint === 'function') {
    d.drawnPoint(HEAD);
    if (!fin(HEAD.x + HEAD.y + HEAD.z)) return false;
  }
  HEAD.y += over;
  return true;
}

// ---- the screen (as DuelFx._screen), reused
const SCR = { mpp: 0.025, px: 0, py: 0, cw: 5, ch: 8, ok: false };
const screen = (game, x, y, z) => {
  const S = SCR, cam = game.camera, p = game.pipeline;
  S.ok = false;
  S.mpp = 0.025;
  S.cw = p?.artCell?.x > 0 ? p.artCell.x : 5;
  S.ch = p?.artCell?.y > 0 ? p.artCell.y : 8;
  const W = p?.width, H = p?.height, m = cam?.matrixWorldInverse?.elements, e = cam?.projectionMatrix?.elements;
  if (!m || !e || !(W > 8) || !(H > 8)) return S;
  const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
  if (!(vz > 0.2) || !fin(vx + vy + vz) || !(e[5] > 0)) return S;
  const mpp = (2 * vz) / (H * e[5]);
  const px = (((vx * e[0]) / vz) * 0.5 + 0.5) * W, py = (((vy * e[5]) / vz) * 0.5 + 0.5) * H;
  if (!fin(mpp + px + py) || !(mpp > 1e-5)) return S;
  S.mpp = mpp;
  S.px = px;
  S.py = py;
  S.ok = true;
  return S;
};

// ---- the cells of one mark: whole-cell offsets (i right, j up) from its lowest centre cell
const MAXC = 64;
const CI = new Int16Array(MAXC), CJ = new Int16Array(MAXC), CH = new Float32Array(MAXC);
let nc = 0;
const put = (i, j, h) => {
  if (!(h > 0.05)) return;
  for (let k = 0; k < nc; k++) {
    if (CI[k] === i && CJ[k] === j) {
      if (h > CH[k]) CH[k] = h;
      return;
    }
  }
  if (nc >= MAXC) return;
  CI[nc] = i;
  CJ[nc] = j;
  CH[nc] = h;
  nc++;
};

/** The shape of mark M this frame: `s` its size (cells), `a` 0..1 its strength, `u` 0..1 how far on. */
function shape(M, s, a, u, popped) {
  const H = TELL_MARK.heat, line = (H.line + H.rise * u) * a, hot = H.hot * a, dim = H.dim * a;
  const two = markCount(M.tell) === 2;
  const tall = popped ? 1 : 0;
  switch (M.look) {
    case 'chevron': {
      // a V: arms of n cells, one cell a step on the diagonal ('\' and '/'), a hot tip
      const n = Math.max(2, Math.round(2 * s)) + tall;
      const V = (j0) => {
        put(0, j0, hot);
        for (let q = 1; q <= n; q++) {
          put(q, j0 + q, line);
          put(-q, j0 + q, line);
        }
      };
      V(0);
      if (two) V(n + 1);
      return;
    }
    case 'diamond': {
      // a diamond of R cells to each side, V up and down, round a hot heart; a dodge: a second ring
      const ring = (R, V, j0, h) => {
        for (let q = 0; q < R; q++) {
          const v = Math.round((q / R) * V);
          put(R - q, j0 + v, h);
          put(-(R - q), j0 + v, h);
          put(R - q, j0 - v, h);
          put(-(R - q), j0 - v, h);
        }
        put(0, j0 + V, h);
        put(0, j0 - V, h);
      };
      const R = Math.max(2, Math.round(2 * s)) + tall, V = Math.max(2, Math.round(2 * s)) + tall;
      const j0 = two ? V + 2 : V;
      put(0, j0, hot);
      ring(R, V, j0, line);
      if (two) ring(R + 3, V + 2, j0, dim);
      return;
    }
    default: {
      // '!': a column of '|' over a gap and a hot digit; a dodge: two of them, a cell apart
      const n = Math.max(3, Math.round(3 * s)) + tall;
      const bang = (i) => {
        put(i, 0, hot);
        for (let q = 2; q < 2 + n; q++) put(i, q, q === 2 + n - 1 ? line * 0.92 : line);
      };
      if (two) {
        bang(-1);
        bang(1);
      } else bang(0);
    }
  }
}

// the one-copy frame clock (impactStamp.js): fx time, and when the blobs alive now die
let fxNow = 0;
let deadline = -1;
const copyLife = (d) => Math.max(0.021, d * 1.6);
const B = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.3, sizeEnd: 0.3, heat: 1, heatEnd: 1, kind: K_STEEL, drag: 0, gravity: 0 };

/** Write mark M's current frame with blobs living `life` s. Returns the blobs written. */
function draw(game, M, life) {
  const F = game.fx?.fire;
  if (!F?.spawn || !anchor(game, M)) return 0;
  const L = TELL_MARK, A = axes(game);
  // its strength: full from the first frame (a signal), dimming over its last `fade` s
  const left = M.end - M.age;
  const a = left >= L.fade ? 1 : Math.max(0, left / L.fade);
  if (!(a > 0.02)) return 0;
  const u = M.end > 0 ? Math.min(1, M.age / M.end) : 1;
  // the anchor: pulled toward the camera along the view ray (it does not move on screen)
  let x = HEAD.x, y = HEAD.y, z = HEAD.z;
  const cam = game.camera?.position;
  if (cam) {
    const dx = cam.x - x, dy = cam.y - y, dz = cam.z - z, l = Math.hypot(dx, dy, dz);
    if (l > L.pull * 1.5 && fin(l)) {
      x += (dx / l) * L.pull;
      y += (dy / l) * L.pull;
      z += (dz / l) * L.pull;
    }
  }
  const P = screen(game, x, y, z);
  const cw = P.cw, ch = P.ch, mpp = P.mpp, ok = P.ok;
  let px0 = P.px, py0 = P.py;
  // the hero's figure on screen (an ellipse round his middle): never printed over
  let hx = 0, hy = 0, hrx = 0, hry = 0;
  const hp = game.player?.position, SP = L.spare;
  if (ok && hp && fin(hp.x + hp.y + hp.z)) {
    const Q = screen(game, hp.x, hp.y + SP.foot, hp.z);
    const fx = Q.px, fy = Q.py, qok = Q.ok;
    screen(game, hp.x, hp.y + SP.head, hp.z);
    if (qok && Q.ok) {
      hx = (fx + Q.px) * 0.5;
      hy = (fy + Q.py) * 0.5;
      hrx = SP.rx / Q.mpp;
      hry = Math.hypot(Q.px - fx, Q.py - fy) * 0.5 + SP.pad / Q.mpp;
    }
  }
  nc = 0;
  shape(M, M.k, a, u, M.age < L.pop);
  // onto the centre of the cell the anchor falls in, `gap` cells up
  if (ok) {
    const ox = ((Math.floor(px0 / cw) + 0.5) * cw - px0) * mpp, oy = ((Math.floor(py0 / ch) + 0.5) * ch - py0) * mpp;
    x += A.rx * ox + A.ux * oy;
    y += A.ry * ox + A.uy * oy;
    z += A.rz * ox + A.uz * oy;
    px0 = (Math.floor(px0 / cw) + 0.5) * cw;
    py0 = (Math.floor(py0 / ch) + 0.5) * ch;
    // a cue must be SEEN: a head near the frame's edge has its mark moved inside it, whole cells, in
    // the screen's plane (as the flare is: FLARE_MARGIN)
    const W = game.pipeline?.width, H = game.pipeline?.height;
    if (W > 8 && H > 8) {
      let mi = 0, mj = 0;
      for (let k = 0; k < nc; k++) {
        const ai = CI[k] < 0 ? -CI[k] : CI[k];
        if (ai > mi) mi = ai;
        if (CJ[k] > mj) mj = CJ[k];
      }
      const mx = W * L.margin[0] + (mi + 1) * cw, my = H * L.margin[1];
      const top = py0 + (mj + L.gap + 1) * ch;
      const sy = top > H - my ? Math.floor((H - my - top) / ch) : py0 < my ? Math.ceil((my - py0) / ch) : 0;
      const sx = px0 < mx ? Math.ceil((mx - px0) / cw) : px0 > W - mx ? Math.floor((W - mx - px0) / cw) : 0;
      if (sx || sy) {
        const ox = sx * cw * mpp, oy = sy * ch * mpp;
        x += A.rx * ox + A.ux * oy;
        y += A.ry * ox + A.uy * oy;
        z += A.rz * ox + A.uz * oy;
        px0 += sx * cw;
        py0 += sy * ch;
      }
    }
  }
  const gj = L.gap;
  const D = L.px * (cw / 5) * mpp;
  B.life = life;
  B.size = B.sizeEnd = D;
  let n = 0, mi = 0, mj0 = 1e9, mj1 = -1e9;
  for (let k = 0; k < nc; k++) {
    const j = CJ[k] + gj;
    if (hrx > 0) {
      const ex = (px0 + CI[k] * cw - hx) / hrx, ey = (py0 + j * ch - hy) / hry;
      if (ex * ex + ey * ey < 1) continue;
    }
    const ox = CI[k] * cw * mpp, oy = j * ch * mpp;
    const bx = x + A.rx * ox + A.ux * oy, by = y + A.ry * ox + A.uy * oy, bz = z + A.rz * ox + A.uz * oy;
    if (!(by >= L.minY) || !fin(bx + bz)) continue;
    B.x = bx;
    B.y = by;
    B.z = bz;
    B.heat = B.heatEnd = CH[k];
    if (F.spawn(B) >= 0) {
      n++;
      const ai = CI[k] < 0 ? -CI[k] : CI[k];
      if (ai > mi) mi = ai;
      if (j < mj0) mj0 = j;
      if (j > mj1) mj1 = j;
    }
  }
  // the dye: the flare's colour, on black
  const st = TELL_STYLE[M.tell]?.flare;
  if (n > 0 && ok && F.tint && st?.tint) {
    const I = L.ink, cy = py0 + ((mj0 + mj1) / 2) * ch, ry = ((mj1 - mj0) / 2 + 1.5) * ch * I.pad;
    F.tint(I.id + M.slot, px0, cy, (mi + 1.5) * cw * I.pad, ry, st.tint, 1, I.dark, life + 0.004);
  }
  TELL_MARK_LAST.blobs = n;
  if (n > 0) {
    TELL_MARK_LAST.drawn++;
    TELL_MARK_LAST.px = ok ? px0 : NaN;
    TELL_MARK_LAST.py = ok ? py0 + gj * ch : NaN;
  }
  return n;
}

/** Per frame, in the world's step after the fire field's update (main.js simulateWorld): age the
 *  marks in GAME time (`dt`: slow motion stretches them with the blow) and draw them in fx time (one
 *  copy alive). Never throws. */
export function tellMarkUpdate(game, dt, fxDt) {
  try {
    const g = fin(dt) && dt > 0 ? dt : 0;
    const d = fin(fxDt) && fxDt > 0 ? fxDt : g;
    let any = false;
    for (const M of marks) {
      if (!M.alive) continue;
      M.age += g;
      if (M.age >= M.end || look === 'off') M.alive = false;
      else any = true;
    }
    if (!(d > 0)) return;
    fxNow += d;
    if (!any || !game?.fx?.fire?.spawn) return;
    if (fxNow + d < deadline) return;
    const life = copyLife(d);
    deadline = fxNow + life;
    for (const M of marks) if (M.alive) draw(game, M, life);
  } catch {
    /* never freeze the frame */
  }
}
