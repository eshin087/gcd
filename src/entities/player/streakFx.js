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
//   - the FIRE (round 2, the owner: "a cool faint fiery aura very subtle but cool"; the main read):
//     faint heat in the fire field round him (game.fx.fire, STYLE.md "The fire field"), in the game's
//     own small letters: many small COOL blobs (the red-stroke / dim-digit band, never the yellow or
//     white core) rising off his shoulders, back and blade, laid a little BEHIND him as the camera
//     sees him so it wreathes him without covering him. Tier 1 a few wisps at his back and blade;
//     tier 3 a thin wreath round him; tier 5 a dim aura with tongues rising about a body-length, and
//     the blade burning faintly along its swings. Two colours for the owner (STREAK_FIRE.look,
//     `?auraFire=a|b`): (a) the field's own fire, (b) a cold steel-blue fire (the `steel` kind, dyed
//     by a tint zone round him while a tint slot is free). Rate-born (no per-frame copies to stack in
//     slow motion), capped per frame and under a field governor. It steps aside through the flurry
//     and the plunge (their own look).
// When the streak is LOST (player:streak lost >= 2) it all goes in one readable instant: the edge
// line snaps dark and breaks into falling strokes, his letters drop off him to the ground, and his
// fire collapses: every blob of it still alive turns to a short puff of smoke letters at once.
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
import { DIM } from './model.js';

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

const urlFire = (() => {
  try {
    const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('auraFire') : null;
    return v === 'b' ? 'b' : v === 'a' ? 'a' : null;
  } catch {
    return null;
  }
})();

/**
 * The fire round him per tier (index 0 = none). `look` 'a' the field's fire, 'b' cold steel-blue.
 *   rate   blobs / s off his body (`blade`: the share of them off the steel)
 *   heat   each blob's heat at birth (it cools to 0): kept in the red-stroke / dim-digit band
 *   size   m across; life [min, max] s; rise [vy min, vy max] m/s, `lift` the upward pull (gravity)
 *   reach  'back' (tiers 1 - 2: his back half and the blade only) or 'all' (round his whole outline)
 *   trail  blobs a swing frame along the steel while he cuts (tiers 4 - 5)
 *   behind m the blob is laid away from the camera (it wreathes him, never covers him)
 *   cap    blobs a frame at most; field: the field's count over which the aura thins out [from, to]
 */
export const STREAK_FIRE = {
  look: urlFire ?? 'a',
  rate: [0, 10, 16, 28, 38, 52],
  blade: [0, 0.45, 0.35, 0.3, 0.3, 0.3],
  heat: [0, 0.34, 0.35, 0.37, 0.39, 0.41], // (under ~0.3 the field prints nothing: fewer blobs, not cooler ones, make it faint)
  steelHeat: 1.4, // (b): the steel kind prints dimmer and only above ~0.4: its heat this much higher
  out: 0.2, // m a body point is pushed out sideways on the screen (the wreath stands round his outline)
  size: [0, 0.28, 0.3, 0.33, 0.36, 0.4],
  life: [[0, 0], [0.22, 0.36], [0.26, 0.42], [0.3, 0.5], [0.36, 0.62], [0.42, 0.8]],
  rise: [0.5, 1.2],
  lift: 1.3,
  reach: [null, 'back', 'back', 'all', 'all', 'all'],
  trail: [0, 0, 0, 0, 2, 3],
  trailHeat: 0.24,
  behind: 0.18,
  cap: 8,
  field: [3800, 5200],
  // (b) the tint zone that dyes the steel kind round him (radii in m of the world at his depth)
  tint: { id: 735101, rgb: [0.75, 1.35, 2.4], k: 0.95, rx: 0.55, ry: 1.25 },
  smoke: 0.18, // the loss: every live blob of his turns to smoke this long
  mark: 0.917, // (his blobs' drag: how the loss finds them in the field)
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
    grass: { glyph: ".,'`", color: [0.34, 0.48, 0.25], end: [0.08, 0.12, 0.06] },
    ash: { glyph: '.,`', color: [0.6, 0.52, 0.47], end: [0.14, 0.11, 0.1] },
    grit: { glyph: '.,:', color: [0.52, 0.52, 0.56], end: [0.1, 0.1, 0.12] },
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
    this.fireAcc = 0;
    this.fireN = 0; // blobs this frame (tests)
    this.firePeak = 0; // the most in one frame
    this.fireHeat = 0; // heat written this frame (tests: monotone by tier)
    this.doused = 0;
    this._fb = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.3, size: 0.3, sizeEnd: 0.1, heat: 0.2, heatEnd: 0, kind: 'fire', drag: STREAK_FIRE.mark, gravity: 1 };
    this._b0 = { x: 0, y: 0, z: 0 }; // where he stood when his body was sampled
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
          life: R(0.45, 0.8), size: R(0.26, 0.32), sizeEnd: 0.2,
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
    this.fireAcc = 0;
    if (!(k > 0)) return;
    this.losses++;
    this._douse();
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
      const q = P.position;
      if (q) {
        this._b0.x = q.x;
        this._b0.y = q.y;
        this._b0.z = q.z;
      }
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
      this.fireN = 0;
      this.fireHeat = 0;
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
    this.fireN = 0;
    this.fireHeat = 0;
    if (away) return;
    this._fire(dt, t, kk);
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

  // ------------------------------------------------------------------ the fire
  /** The faint fire round him this frame (tier t, strength kk). Rate-born, capped, never throws. */
  _fire(dt, t, kk) {
    const F = STREAK_FIRE, f = this.game.fx?.fire, P = this.game.player;
    if (!f || typeof f.spawn !== 'function' || !P?.position) return;
    const gov = 1 - Math.min(1, Math.max(0, ((f.count | 0) - F.field[0]) / (F.field[1] - F.field[0])));
    if (!(gov > 0.02)) return;
    const steel = F.look === 'b';
    const C = this.game.camera?.matrixWorld?.elements;
    // the camera's back axis (C[8..10] points at the viewer): his fire is laid away from it
    const bx = C ? -C[8] * F.behind : 0, by = C ? -C[9] * F.behind : 0, bz = C ? -C[10] * F.behind : 0;
    const v = this.vis, heat = F.heat[t] * Math.min(1.25, kk) * (0.6 + 0.4 * v) * (steel ? F.steelHeat : 1), size = F.size[t] * (0.85 + 0.15 * Math.min(1.5, kk));
    const L = F.life[t], q = P.position;
    this.fireAcc += dt * F.rate[t] * kk * gov * v;
    let n = Math.min(F.cap, Math.floor(this.fireAcc));
    this.fireAcc -= n;
    if (this.fireAcc > 4) this.fireAcc = 4;
    const pts = n > 0 ? this._body() : null, np = this.bodyN;
    const e = P.rig?.sword?.matrixWorld?.elements;
    const z0 = DIM.forte, z1 = DIM.drawnTip ?? DIM.steelTip;
    const b = this._fb;
    b.kind = steel ? 'steel' : 'fire';
    const back = F.reach[t] === 'back';
    const ox = q.x - this._b0.x, oy = q.y - this._b0.y, oz = q.z - this._b0.z;
    while (n-- > 0) {
      let x = NaN, y = NaN, z = NaN;
      if (e && rnd() < F.blade[t]) {
        const zz = z0 + rnd() * (z1 - z0);
        x = e[8] * zz + e[12];
        y = e[9] * zz + e[13];
        z = e[10] * zz + e[14];
      } else if (pts && np > 8) {
        // a point on him (sampled up to 0.1 s ago, carried along with him), shoulders and up weighted;
        // the back half only at tiers 1 - 2
        for (let tries = 0; tries < 6; tries++) {
          const j = Math.floor(rnd() * np) * 3;
          const px = pts[j] + ox, py = pts[j + 1] + oy, pz = pts[j + 2] + oz, h = py - q.y;
          if (h < 0.45 || (h < 0.9 && rnd() < 0.6)) continue;
          if (back && C && (px - q.x) * C[8] + (pz - q.z) * C[10] > 0) continue;
          // pushed out sideways ON THE SCREEN (the camera's right axis), to the side of him it is on:
          // behind him the body would hide it, so the wreath stands just past his outline
          const sx = C ? (px - q.x) * C[0] + (pz - q.z) * C[2] : 0, w = (sx < 0 ? -1 : 1) * F.out * (0.6 + 0.8 * rnd());
          x = px + (C ? C[0] * w : 0);
          y = py;
          z = pz + (C ? C[2] * w : 0);
          break;
        }
      }
      if (!Number.isFinite(x + y + z)) continue;
      b.x = x + bx + (rnd() - 0.5) * 0.12;
      b.y = Math.max(0.75, y + by);
      b.z = z + bz + (rnd() - 0.5) * 0.12;
      b.vx = (rnd() - 0.5) * 0.3;
      b.vy = F.rise[0] + rnd() * (F.rise[1] - F.rise[0]);
      b.vz = (rnd() - 0.5) * 0.3;
      b.life = L[0] + rnd() * (L[1] - L[0]);
      b.size = size * (0.8 + 0.4 * rnd());
      b.sizeEnd = b.size * 0.4;
      b.heat = heat;
      b.heatEnd = 0;
      b.gravity = F.lift;
      if (f.spawn(b) >= 0) {
        this.fireN++;
        this.fireHeat += heat;
      }
    }
    // tiers 4 - 5: the blade burns faintly along its swings
    const tr = F.trail[t], a = P.atk, st = P.state;
    if (tr > 0 && e && a?.def && (st === 'attack' || st === 'heavy') && !a.pending && a.t >= a.def.windup - 0.04 && a.t <= a.def.windup + a.def.active + 0.08) {
      for (let i = 0; i < tr; i++) {
        const zz = z0 + ((i + rnd()) / tr) * (z1 - z0);
        b.x = e[8] * zz + e[12] + bx;
        b.y = Math.max(0.75, e[9] * zz + e[13] + by);
        b.z = e[10] * zz + e[14] + bz;
        b.vx = b.vz = 0;
        b.vy = 0.3;
        b.life = 0.22 + 0.1 * rnd();
        b.size = size;
        b.sizeEnd = size * 0.5;
        b.heat = F.trailHeat * Math.min(1.25, kk) * (steel ? F.steelHeat : 1);
        b.heatEnd = 0;
        b.gravity = 0.6;
        if (f.spawn(b) >= 0) {
          this.fireN++;
          this.fireHeat += b.heat;
        }
      }
    }
    this.firePeak = Math.max(this.firePeak, this.fireN);
    // (b): the steel round him dyed cold blue, while a tint slot is free (the duelists' come first)
    if (steel && typeof f.tint === 'function') this._tint(f, P);
  }

  _tint(f, P) {
    const T = STREAK_FIRE.tint, ids = f._tintId, ts = f._tintT;
    if (ids && ts) {
      let free = false;
      for (let i = 0; i < ids.length; i++) if (ids[i] === T.id || !(ts[i] > 0)) free = true;
      if (!free) return;
    }
    const cam = this.game.camera, p = this.game.pipeline, m = cam?.matrixWorldInverse?.elements, pe = cam?.projectionMatrix?.elements;
    const W = p?.width, H = p?.height, q = P.position;
    if (!m || !pe || !(W > 8) || !(H > 8) || !q) return;
    const x = q.x, y = q.y + 1.2, z = q.z;
    const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
    if (!(vz > 0.2) || !(pe[5] > 0)) return;
    const ppm = (H * pe[5]) / (2 * vz), px = (((vx * pe[0]) / vz) * 0.5 + 0.5) * W, py = (((vy * pe[5]) / vz) * 0.5 + 0.5) * H;
    if (!Number.isFinite(ppm + px + py)) return;
    f.tint(T.id, px, py, T.rx * 2 * ppm, T.ry * 2 * ppm, T.rgb, T.k * Math.min(1, this.vis), 0, 0.06);
  }

  /** The loss: every blob of his fire still alive turns to a short puff of smoke at once. */
  _douse() {
    const f = this.game.fx?.fire, d = f?.data, n = f?.count | 0;
    if (!d || !(n > 0)) return;
    const W = Math.round(d.length / Math.max(1, f.max | 0)) || 15, M = STREAK_FIRE.mark, sm = STREAK_FIRE.smoke;
    let c = 0;
    for (let i = 0; i < n; i++) {
      const k = i * W;
      if (Math.abs(d[k + 13] - M) > 1e-4) continue; // (his: the drag mark)
      d[k + 12] = 1; // smoke
      d[k + 6] = 0;
      d[k + 7] = sm;
      d[k + 4] = Math.min(d[k + 4], 0.2);
      d[k + 10] = Math.min(0.5, d[k + 10] * 1.4);
      d[k + 11] = 0;
      d[k + 14] = -0.4;
      c++;
    }
    this.doused = c;
  }

  /** Drop everything it draws (a level reset). */
  clear() {
    this.tier = this.count = 0;
    this.vis = this.tickT = this.shedAcc = 0;
    this.edge = this.edgeA = this.bladeLine = this.echoes = this.echoA = 0;
    this.fireAcc = this.fireN = this.fireHeat = 0;
  }
}
