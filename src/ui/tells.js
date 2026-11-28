import { TELL } from '../combat/rules.js';
import { el, num } from './dom.js';
import { Blackout, blackOn } from '../combat/blackout.js';

// Screen-edge cues. The attack tells themselves live in the world (docs/COMBAT.md): a blow is read
// from its windup and cued by a white glint, or by THE FLARE of a moment (ADR-118). The HUD adds no
// text, icons or rings — only:
//   the flare's edge   a brief vignette flash (~0.25 s, fading) in the flare's colour on the timing
//         cue ('combat:flash') of a moment: red (dodge), blue (parry: a blue blow marked `flare`),
//         black (a charged blow: the edges go dark), a little stronger on the attacker's side.
//         Nothing for an ordinary white glint.
//   the charge   while a black blow charges ('combat:charge' { dur }) the edges darken slowly.
//   cyan  the Ghostep pulse (driven by the HUD).
// With the blackout on (?black=a|b|c, combat/blackout.js: the whole frame's grade, owned here as
// `game.blackout` and stepped with the edges) a black blow darkens no edge: the picture does it.
// The red flash runs on game time, so slow-mo and the Lab time scale stretch it with the attack.
// A cancelled windup (stagger / posture break / death) or a reset drops it.

const RED_TIME = 0.25; // s (game time): the red flash fades out over this
const RED_PEAK = 0.85; // edge opacity at the cue (x the per-side weight)
const CHARGE_PEAK = 0.6; // ... and at the end of a black blow's charge
const KIND_CLASS = { [TELL.RED]: '', [TELL.BLUE]: 'blue', [TELL.BLACK]: 'black' };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class TellEdges {
  constructor(game, parent, projector) {
    this.game = game;
    this.proj = projector;
    this.edges = new EdgeGlow(parent);
    this.p = { x: 0, y: 0, on: false, front: false };
    this.redAt = -1; // game time of the last flare's timing cue (-1 = none showing)
    this.kind = TELL.RED; // ... and its tell: the edges' colour
    this.chargeAt = -1; // game time a black blow began to charge (-1 = none), and for how long
    this.chargeDur = 1;
    this.rx = NaN; // its world position (the striking part): weights the edges toward the attacker
    this.ry = NaN;
    this.rz = NaN;
    // the blackout (combat/blackout.js): the whole picture's grade on a black blow, cleared with the edges
    this.black = new Blackout(game);
    game.blackout = this.black;
    const ev = game.events;
    ev?.on('combat:flash', (d) => this._onFlash(d));
    ev?.on('combat:charge', (d) => {
      this.chargeAt = num(this.game.time);
      this.chargeDur = Math.max(0.2, num(d?.dur, 1));
    });
    for (const name of ['dragon:stagger', 'dragon:postureBreak', 'dragon:death']) ev?.on(name, () => this.clear());
    ev?.on('game:retry', () => this.clear());
    ev?.on('state', (e) => {
      const to = e?.to;
      // (resuming from pause keeps the flash: game time froze with it)
      if (to === 'title' || to === 'dead' || to === 'victory' || (to === 'explore' && e?.from !== 'paused')) this.clear();
    });
  }

  clear() {
    this.redAt = -1;
    this.chargeAt = -1;
    this.black.clear();
  }

  _onFlash(d) {
    // self-announcing fire hazards (meteors, chase pillars: d.hazard) warn with their own ground rings;
    // flashing the screen edge for each one made a meteor rain pulse the whole HUD
    if (!d || typeof d !== 'object' || d.hazard) return;
    if (d.tell !== TELL.RED && d.tell !== TELL.BLACK && !(d.tell === TELL.BLUE && d.flare)) return;
    if (d.tell === TELL.BLACK && blackOn()) return (this.chargeAt = -1); // (the blackout is its cue)
    this.kind = d.tell;
    this.chargeAt = -1; // (a black blow's charge ends in its flare)
    this.redAt = num(this.game.time);
    this.rx = num(d.x, NaN);
    this.ry = num(d.y, 2);
    this.rz = num(d.z, NaN);
  }

  update(realDt) {
    const g = this.game;
    const W = this.proj.w;
    const H = this.proj.h;
    let red = 0;
    let sx = W * 0.5;
    let sy = H * 0.5;
    // paused: the flash freezes with game time, but the edges must not glow under the menu
    if (this.redAt >= 0 && g.state !== 'paused') {
      const age = num(g.time) - this.redAt;
      if (!(age >= 0) || age >= RED_TIME) this.redAt = -1;
      else {
        const f = 1 - age / RED_TIME;
        red = RED_PEAK * f * (0.4 + 0.6 * f);
        if (this.proj.project(this.rx, this.ry, this.rz, this.p)) {
          sx = this.p.x;
          sy = this.p.y;
        }
      }
    }
    // a black blow charging: the edges darken toward its cue (dropped a moment after it should have come)
    if (this.chargeAt >= 0 && blackOn()) this.chargeAt = -1;
    if (this.chargeAt >= 0 && !(red > 0) && g.state !== 'paused') {
      const age = num(g.time) - this.chargeAt;
      if (!(age >= 0) || age > this.chargeDur + 0.4) this.chargeAt = -1;
      else {
        this.kind = TELL.BLACK;
        red = CHARGE_PEAK * clamp01(age / this.chargeDur);
        sx = W * 0.5;
        sy = H * 0.5;
      }
    }
    this.edges.update(realDt, red, sx, sy, W, H, this.kind);
    this.black.update();
  }

  /** Cool cyan edge pulse for Ghostep (driven by the HUD). */
  ghost(amount) {
    this.edges.ghostPulse(amount);
  }
}

/** Screen-edge glows: red (direction-weighted toward the attacker) + a cool cyan Ghostep pulse. */
class EdgeGlow {
  constructor(parent) {
    this.root = el('div', 'ab-edges', null, parent);
    this.sides = ['l', 'r', 't', 'b'].map((k) => ({ node: el('div', `ab-edge ${k}`, null, this.root), op: -1 }));
    this.cool = el('div', 'ab-edge-cool', null, this.root);
    this.coolOp = -1;
    this.coolAmt = 0;
    this.red = 0;
    this.kind = '';
    this.w = [0, 0, 0, 0]; // per-side weights l r t b (reused)
  }

  ghostPulse(amount = 1) {
    this.coolAmt = Math.max(this.coolAmt, clamp01(num(amount, 1)));
  }

  update(dt, target, x, y, W, H, kind = TELL.RED) {
    dt = num(dt, 0);
    // the edges' colour: the flare's (set only while one shows: a fading one keeps its own)
    const cls = KIND_CLASS[kind] ?? '';
    if (num(target, 0) > 0 && cls !== this.kind) {
      this.kind = cls;
      this.root.className = cls ? `ab-edges ${cls}` : 'ab-edges';
    }
    // instant attack; the release only smooths a clear / pause (the flash's own fade is slower)
    const t = clamp01(num(target, 0));
    this.red = t >= this.red ? t : Math.max(t, this.red - dt * 6);
    const dx = Math.max(-1, Math.min(1, (num(x, W / 2) - W / 2) / (W / 2)));
    const dy = Math.max(-1, Math.min(1, (num(y, H / 2) - H / 2) / (H / 2)));
    const w = this.w;
    w[0] = 0.4 + 0.6 * Math.max(0, -dx);
    w[1] = 0.4 + 0.6 * Math.max(0, dx);
    w[2] = 0.4 + 0.6 * Math.max(0, -dy);
    w[3] = 0.4 + 0.6 * Math.max(0, dy);
    for (let i = 0; i < 4; i++) {
      const s = this.sides[i];
      const op = Math.round(this.red * w[i] * 100) / 100;
      if (op !== s.op) {
        s.op = op;
        s.node.style.opacity = String(op);
      }
    }
    if (this.coolAmt > 0) this.coolAmt = Math.max(0, this.coolAmt - dt * 1.4);
    const cop = Math.round(this.coolAmt * 100) / 100;
    if (cop !== this.coolOp) {
      this.coolOp = cop;
      this.cool.style.opacity = String(cop);
    }
  }
}
