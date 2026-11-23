// THE STREAK ON THE HERO AND IN THE WORLD (combat/streak.js: the `aura` and `world` pieces).
//
// AURA: one graded idea, "the steel remembers": a run of perfect defences shows on the hero himself,
// in lines and letters of his own cold steel, a little more at each tier (streakTier 1..5):
//   - the EDGE: a fine, steady line of light along the blade's edge that reaches further up the
//     steel at each tier (the forte first, the whole edge at tier 5; fx.bladeHalo draws it), and
//     the blade's own ink and rim lines held a little lit at rest (player._updateMaterials reads
//     `bladeLine`: the flats stay dark, ADR-130; a cut still lights the whole steel);
//   - the ECHO: each swing's arc leaves fine echo lines inside its edge (fx.trail reads `echoes`);
//   - the WAKE: when he moves fast (a roll, a sprint, a dash) he leaves sparse copies of his own
//     letters behind him (the afterimage's fine digits, fainter and shorter at low tiers);
//   - at tiers 4 - 5 a few of his coat's letters LIFT OFF and trail behind him (one cell each).
// When the streak is LOST (player:streak lost >= 2) it all goes in one readable instant: the edge
// line snaps dark and breaks into falling strokes, and his letters drop off him to the ground.
//
// WORLD: at tier >= 2 each perfect defence (every count the streak goes up by one) is answered by
// the ground round him for a moment: a short radial lean of the grass (world.gust: weaker than any
// of the wyrm's, so it never replaces one), a ring of the floor's own grit / motes / ash lifting at
// his feet, and at tiers 4 - 5 a few loose letters rising slowly round him. Calm: it happens many
// times in a string, so it is the air answering, never a burst; nothing in it looks like a ground
// warning (no red, no ring on the ground, nothing that stays).
//
// Every look reads streakK('aura') / streakK('world') (0 = exactly today: nothing is spawned, and
// the hero's materials and the arc get exactly today's values). Its own random stream (ADR-122).

import { streakTier, streakK } from '../../combat/streak.js';

let sseed = 0x6a09e667;
const rnd = () => (sseed = (Math.imul(sseed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);

/** The tuning (one entry per tier, index 0 = no streak). */
export const STREAK_AURA = {
  // the edge line: share of the steel lit from the forte, its alpha, the blade lines' rest lift
  edge: [0, 0.34, 0.5, 0.66, 0.83, 1],
  edgeA: [0, 0.6, 0.7, 0.8, 0.9, 1],
  line: [0, 0.08, 0.12, 0.17, 0.22, 0.28], // (more blooms into a glow round the steel)
  rise: 5, // 1/s: how fast a new tier comes up (it is there in ~0.3 s)
  tick: 0.18, // s: a new tier's edge burns brighter this long
  // the arc's echo lines (fx.trail)
  echoes: [0, 1, 1, 2, 2, 3],
  echoA: [0, 0.34, 0.4, 0.46, 0.52, 0.6],
  // the wake of letters on a fast move: s between two copies, every n-th body point, life, alpha
  wakeEvery: { roll: 0.075, dash: 0.06, sprint: 0.13 },
  wakeStep: [0, 7, 5, 4, 3, 3],
  wakeLife: [0, 0.12, 0.16, 0.2, 0.26, 0.32],
  wakeA: [0, 0.28, 0.34, 0.42, 0.5, 0.58],
  // loose letters off his coat (letters / s)
  shed: [0, 0, 0, 0, 2.5, 5],
  // the loss: letters dropped per lost tier (+ base), the edge's falling strokes
  drop: { base: 6, perTier: 7, max: 44, strokes: 5 },
  cell: 0.13, // m: one letter (his afterimage's cell)
  // the hero's cold steel, a little whiter at the top tiers (no new hue per tier)
  col: [1.2, 1.75, 2.6], colTop: [1.9, 2.35, 3.0], dim: [0.42, 0.68, 1.3], end: [0.12, 0.25, 0.75], dark: [0.05, 0.07, 0.12],
};

/** The world's answer per tier (0 below tier 2). */
export const STREAK_WORLD = {
  minTier: 2,
  gust: [0, 0, 0.34, 0.42, 0.52, 0.62], // strength (the wyrm's are 1.2 - 2.0)
  gustR: [0, 0, 3.4, 3.8, 4.3, 4.8], // m
  ring: [0, 0, 7, 9, 11, 13], // floor bits lifting at his feet
  rise: [0, 0, 0, 0, 4, 7], // loose letters rising round him (tiers 4 - 5)
  // the floors (level id → bits): grass motes, the courtyard's ash, stone grit
  ground: {
    grass: { glyph: ".,'`", color: [0.2, 0.28, 0.15], end: [0.06, 0.09, 0.05] },
    ash: { glyph: '.,`', color: [0.36, 0.3, 0.27], end: [0.1, 0.08, 0.07] },
    grit: { glyph: '.,:', color: [0.3, 0.3, 0.33], end: [0.08, 0.08, 0.1] },
  },
  floor: { cinderwood: 'grass', grove: 'grass', ash: 'ash', starless: 'grit', ring: 'grit', fox: 'grit', lab: 'grit' },
};

const DIGITS = '0123456789';

export class StreakFx {
  constructor(game) {
    this.game = game;
    /** Perfect defences answered so far (tests). */
    this.n = 0;
    /** Losses shown so far (tests). */
    this.losses = 0;
    // what the hero's look reads this frame (0 = today)
    this.edge = 0; // share of the steel the edge line covers
    this.edgeA = 0; // its alpha
    this.bladeLine = 0; // the blade lines' rest lift (player._updateMaterials)
    this.echoes = 0; // the arc's echo lines (fx.trail)
    this.echoA = 0;
    this.vis = 0; // 0..1 how much of the tier is up (it rises; it drops at once)
    this.tier = 0;
    this.count = 0;
    this.tickT = 0;
    this.wakeT = 0;
    this.shedAcc = 0;
    this.bodyT = 1;
    this.bodyN = 0;
    this._cells = new Set();
    this._off = [];
    const ev = game?.events;
    if (ev?.on) {
      this._off.push(ev.on('player:streak', (d) => this._onStreak(d)));
    }
  }

  /** The tier the hero's look shows (0 with the piece off). */
  _auraK() {
    return streakK('aura');
  }

  _onStreak(d) {
    const count = Number(d?.count) || 0, lost = Number(d?.lost) || 0;
    const prev = this.count;
    this.count = count;
    if (count <= 0) {
      if (lost >= 2) this._lose(lost);
      this.tier = 0;
      this.vis = 0;
      return;
    }
    const t = streakTier(count);
    if (t > this.tier) this.tickT = STREAK_AURA.tick;
    this.tier = t;
    if (count === prev + 1) this._answer(t);
  }

  // ------------------------------------------------------------------ world
  /** A perfect defence at tier t: the ground round him answers (streakK('world')). */
  _answer(t) {
    const k = streakK('world'), W = STREAK_WORLD;
    if (!(k > 0) || t < W.minTier) return;
    const g = this.game, p = g.player?.position;
    if (!p || !Number.isFinite(p.x + p.z)) return;
    this.n++;
    const ti = Math.min(t, W.gust.length - 1);
    g.world?.gust?.(p.x, p.z, W.gust[ti] * Math.min(1.5, k), W.gustR[ti]);
    const fx = g.fx?.alpha, add = g.fx?.add;
    const fl = W.ground[W.floor[g.level?.stage === 'lab' ? 'lab' : g.level?.id] ?? 'grass'] ?? W.ground.grit;
    // a ring of the floor's bits at his feet, lifting and leaning out
    const n = Math.round(W.ring[ti] * Math.min(1.5, k));
    if (fx) {
      for (let i = 0; i < n; i++) {
        const a = ((i + R(-0.3, 0.3)) / n) * Math.PI * 2, r = R(0.35, 0.6), sp = R(0.5, 1.1);
        fx.spawn({
          x: p.x + Math.cos(a) * r, y: R(0.04, 0.12), z: p.z + Math.sin(a) * r,
          vx: Math.cos(a) * sp, vy: R(0.5, 1.1), vz: Math.sin(a) * sp,
          life: R(0.45, 0.8), size: R(0.2, 0.26), sizeEnd: 0.16,
          glyph: fl.glyph, color: fl.color, colorEnd: fl.end, alpha: 0.8, alphaEnd: 0, drag: 2.6, gravity: -1.2,
        });
      }
    }
    // tiers 4 - 5: loose letters rising slowly round him for a second
    const m = Math.round(W.rise[ti] * Math.min(1.5, k));
    if (add) {
      const A = STREAK_AURA;
      for (let i = 0; i < m; i++) {
        const a = R(0, Math.PI * 2), r = R(0.5, 0.95);
        add.spawn({
          x: p.x + Math.cos(a) * r, y: R(0.15, 0.7), z: p.z + Math.sin(a) * r,
          vx: Math.cos(a) * 0.12, vy: R(0.5, 0.9), vz: Math.sin(a) * 0.12,
          life: R(0.8, 1.15), size: A.cell * 1.2, sizeEnd: A.cell * 0.8,
          glyph: DIGITS, color: A.dim, colorEnd: A.end, alpha: 0.75, alphaEnd: 0, drag: 0.8, flicker: 0.25,
        });
      }
    }
  }

  // ------------------------------------------------------------------ the loss
  /** The streak is over: the edge snaps dark and breaks, his letters drop off him. */
  _lose(lost) {
    const k = this._auraK();
    const tLost = Math.max(this.tier, streakTier(lost));
    const wasEdge = this.edge, wasA = this.edgeA;
    this.edge = this.edgeA = this.bladeLine = this.echoes = this.echoA = 0;
    if (!(k > 0)) return;
    this.losses++;
    const g = this.game, P = g.player, add = g.fx?.add, A = STREAK_AURA;
    if (!add || !P) return;
    // the edge line breaks into a few strokes that fall away
    const sw = P.rig?.sword, e = sw?.matrixWorld?.elements;
    if (e && wasEdge > 0) {
      const z0 = 0.2, z1 = 0.2 + (0.9 - 0.2) * wasEdge, ns = A.drop.strokes;
      for (let i = 0; i < ns; i++) {
        const zz = z0 + ((i + 0.5) / ns) * (z1 - z0);
        const x = e[8] * zz + e[12], y = e[9] * zz + e[13], z = e[10] * zz + e[14];
        if (!Number.isFinite(x + y + z)) continue;
        add.spawn({
          x, y, z, vx: R(-0.3, 0.3), vy: R(-0.2, 0.3), vz: R(-0.3, 0.3),
          life: R(0.22, 0.34), size: 0.1, sizeEnd: 0.06, glyph: '|/\\', spin: R(-6, 6),
          color: A.col, colorEnd: A.dark, alpha: Math.min(1, wasA + 0.2), alphaEnd: 0, drag: 1, gravity: -5,
        });
      }
    }
    // his letters drop off him: they fall to the ground and go dark
    const n = Math.min(A.drop.max, Math.round((A.drop.base + A.drop.perTier * tLost) * Math.min(1.5, k)));
    const pts = this._body(true);
    const np = this.bodyN;
    if (!pts || np < 8) return;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rnd() * np) * 3;
      add.spawn({
        x: pts[j], y: pts[j + 1], z: pts[j + 2], vx: R(-0.25, 0.25), vy: R(-0.1, 0.4), vz: R(-0.25, 0.25),
        life: R(0.35, 0.6), size: A.cell * 1.2, sizeEnd: A.cell, glyph: DIGITS,
        color: A.dim, colorEnd: A.dark, alpha: 0.85, alphaEnd: 0, drag: 0.6, gravity: -7,
      });
    }
  }

  /** His body's points (player._sampleBody), sampled at most every 0.1 s unless `now`. */
  _body(now = false) {
    const P = this.game.player;
    if (!P || typeof P._sampleBody !== 'function') return null;
    if (now || this.bodyT >= 0.1) {
      this.bodyT = 0;
      this.bodyN = P._sampleBody() | 0;
    }
    return this.bodyN > 0 ? P._ghostPts : null;
  }

  // ------------------------------------------------------------------ per frame
  /** Per frame, on fx time (it runs on through a hit-stop). Must not throw or allocate. */
  update(dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const k = this._auraK(), P = this.game.player;
    this.bodyT += dt;
    if (!(k > 0) || !P || this.tier <= 0) {
      this.vis = 0;
      this.edge = this.edgeA = this.bladeLine = this.echoes = this.echoA = 0;
      return;
    }
    const A = STREAK_AURA, t = Math.min(this.tier, A.edge.length - 1);
    this.vis = Math.min(1, this.vis + dt * A.rise);
    this.tickT = Math.max(0, this.tickT - dt);
    const st = P.state;
    // he is the flurry's / the plunge's for as long as they run (their own look), and nothing shows
    // on a dead or hidden hero
    const away = !P.alive || st === 'flurry' || st === 'plunge' || (P.ghostFx > 0.5);
    const kk = Math.min(1.5, k);
    const v = this.vis;
    this.edge = away ? 0 : Math.min(1, A.edge[t] * (0.75 + 0.25 * kk)) * v;
    this.edgeA = away ? 0 : Math.min(1, A.edgeA[t] * kk * (1 + (this.tickT > 0 ? 0.6 : 0))) * v;
    this.bladeLine = away ? 0 : A.line[t] * kk * v;
    this.echoes = Math.min(4, Math.round(A.echoes[t] * (kk >= 1.25 ? 1.5 : kk < 0.75 ? 0.5 : 1)));
    this.echoA = A.echoA[t] * kk;
    if (away) return;
    // the edge line on the steel (fx.bladeHalo with no halo dots)
    if (this.edge > 0.01) P.fx?.bladeHalo?.(dt, 0, P.bladeFar ?? 1, this.edge, this.edgeA, t / (A.edge.length - 1));
    // the wake: copies of his letters behind him on a fast move
    const a = P.atk;
    const dash = !!a?.def?.dash && (st === 'attack' || st === 'heavy') && !a.pending;
    const every = st === 'roll' ? A.wakeEvery.roll : dash ? A.wakeEvery.dash : st === 'sprint' ? A.wakeEvery.sprint : 0;
    if (every > 0) {
      this.wakeT += dt;
      if (this.wakeT >= every) {
        this.wakeT = 0;
        this._wake(t, kk);
      }
    } else this.wakeT = 0.5; // the first copy comes at once
    // tiers 4 - 5: a few of his coat's letters lift off and trail
    const sr = A.shed[t] * kk;
    if (sr > 0) {
      this.shedAcc += dt * sr;
      if (this.shedAcc >= 1) {
        const pts = this._body();
        while (this.shedAcc >= 1) {
          this.shedAcc -= 1;
          if (pts) this._shed(pts);
        }
      }
    } else this.shedAcc = 0;
  }

  /** One copy of his letters where he is (every n-th point, one letter to a cell on the screen). */
  _wake(t, kk) {
    const add = this.game.fx?.add, A = STREAK_AURA;
    const pts = this._body(true);
    if (!add || !pts) return;
    const n = this.bodyN, step = Math.max(2, Math.round(A.wakeStep[t] / kk));
    const C = this.game.camera?.matrixWorld?.elements;
    const rx = C ? C[0] : 1, ry = C ? C[1] : 0, rz = C ? C[2] : 0, ux = C ? C[4] : 0, uy = C ? C[5] : 1, uz = C ? C[6] : 0;
    const cell = A.cell, q = 1 / cell, cells = this._cells;
    cells.clear();
    const life = A.wakeLife[t] * Math.min(1.25, kk), alpha = Math.min(0.8, A.wakeA[t] * kk);
    const off = (this.n * 7 + this.losses) % step; // (which points: shifted copy to copy)
    for (let i = off; i < n; i += step) {
      const j = i * 3, px = pts[j], py = pts[j + 1], pz = pts[j + 2];
      const sx = px * rx + py * ry + pz * rz, sy = px * ux + py * uy + pz * uz;
      const cx = Math.round(sx * q), cy = Math.round(sy * q);
      const key = (cx & 0xffff) * 65536 + (cy & 0xffff);
      if (cells.has(key)) continue;
      cells.add(key);
      const mx = cx * cell - sx, my = cy * cell - sy;
      add.spawn({
        x: px + rx * mx + ux * my, y: py + ry * mx + uy * my, z: pz + rz * mx + uz * my,
        life: life * R(0.8, 1.2), size: cell * 1.15, sizeEnd: cell * 0.8, glyph: DIGITS,
        color: A.dim, colorEnd: A.end, alpha, alphaEnd: 0, flicker: 0.2,
      });
    }
    this.wakeN = (this.wakeN | 0) + 1;
  }

  /** A letter lets go of his coat (low on him) and drifts up and back. */
  _shed(pts) {
    const add = this.game.fx?.add, A = STREAK_AURA, P = this.game.player;
    if (!add || !P) return;
    const n = this.bodyN, y0 = P.position?.y ?? 0;
    let j = -1;
    for (let tries = 0; tries < 6; tries++) {
      const c = Math.floor(rnd() * n) * 3, h = pts[c + 1] - y0;
      if (h > 0.25 && h < 1.15) {
        j = c;
        break;
      }
    }
    if (j < 0) return;
    const gv = P.groundVel, vx = Number.isFinite(gv?.x) ? -gv.x * 0.15 : 0, vz = Number.isFinite(gv?.z) ? -gv.z * 0.15 : 0;
    add.spawn({
      x: pts[j], y: pts[j + 1], z: pts[j + 2], vx: vx + R(-0.15, 0.15), vy: R(0.35, 0.7), vz: vz + R(-0.15, 0.15),
      life: R(0.6, 0.95), size: A.cell * 1.15, sizeEnd: A.cell * 0.8, glyph: DIGITS,
      color: A.dim, colorEnd: A.end, alpha: 0.7, alphaEnd: 0, drag: 1.2, flicker: 0.25,
    });
  }

  /** Drop everything it draws (a level reset). */
  clear() {
    this.tier = this.count = 0;
    this.vis = this.tickT = this.shedAcc = 0;
    this.edge = this.edgeA = this.bladeLine = this.echoes = this.echoA = 0;
  }
}
