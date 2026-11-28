import * as THREE from 'three';
import { clamp, wrapAngle, turnToward } from '../../../core/math.js';
import { CONFIG } from '../../../core/config.js';
import { TELL, TELL_STYLE, RESULT, DEFENSE, GUARD, facingDelta } from '../../../combat/rules.js';
import { perPhase } from '../duelist/realise.js';
import { TERRACE } from '../../../world/foxTerrace.js';
import { FoxSpirit } from './spirit.js';
import { VERDICT } from './tuningBeam.js';
import { summonRing, darkSun, beamMark, beamBody, spiritFire, spiritEnd } from './fxBeam.js';

// Heaven-Devouring Howl (`foxVerdict`, phase 3; ADR-154; COMBAT.md → "The Thousand-Body Fox" → "The
// Howl"): he flits to the rim, summons the Nine-Tailed Fox (spirit.js), a dark sun gathers at its jaws,
// the line is fixed at the red cue, and a beam rakes the terrace (lit `sustain`, `selfHit`: this file
// tests the strip and deals the hits), sweeping one way toward the hero's side; the world breaks along it;
// then he kneels open. Numbers: tuningBeam.js (`d.T.verdict`); drawing: fxBeam.js.
// Reference read, not imported: ascendant/kiBeam.js (BeamMoves).
//
// THE ROUTING CONTRACT (fox.js calls these; a beat or move is the Howl's when its def has `verdict`):
//   new FoxHowl(d)            inside his constructor (_setup): builds the spirit now (never mid-fight)
//   reset()                   nothing lit, the spirit hidden, the terrace's light back, the camera back
//   busy                      the summoning, the beam or its fade is under way
//   weigh(name, def, w) → w   the move's weight now (0 before T.verdict.start s into phase 3, within
//                             `every` s of the last one)
//   forced() → name | null    a move to start now instead of the AI's pick (the first time his bar is
//                             under `forceAt`, once)
//   onActStart(A) → bool      the move starts (false refuses it)
//   beatMotion(b, u, s, dt)   a `verdict` beat's motion (the flit, the aim)
//   onImpact(b, s, a)         a `verdict` beat's impact (the beam lit at the beam beat's)
//   onSustain(b, s, a, k)     the lit window's ticks
//   frame(dt)                 every frame after the brain (fox.js brainFrame): the first contact, the sweep,
//                             the world, the clones it pops, the spirit's motion, the light, the camera
//   pose(dt)                  every frame after his pose (fox.js afterPose): the drawing (fxBeam.js)
//   cuePoint(out) → out|null  (fox.js tellPoint) while the beam beat is his: the jaws (the red flare and
//                             the glint are drawn there)
//   phase                     'off' | 'flit' | 'summon' | 'charge' | 'lit' | 'end'
//   B                         the line: { fixed, ox, oz (him: its root), yaw, dx, dz, len, w, t, swept,
//                             sign, taken, first } (the tests read it)
//
// HOW IT PLAYS. The flit (a feint beat): at T.flitAt of it he is gone and T.away m from the hero, away
// from him through the middle (T.rim from the middle at most), facing him. The beam beat's windup (fixed, T.summon + T.charge s): the fox is placed
// behind him SIDE-ON to the camera (its body faces east or west, whichever the line runs toward; only its
// head turns to the line) and rises out of a pool of fire; the ring of script burns out round his palms;
// the terrace's light drops; the darkness of a charged blow (`combat:charge` once: the screen's edge
// dims; his body darkens: d.warnTell black) though the cue is red; then the fox rears and the dark sun
// gathers at its jaws while he aims at the hero. The line is FIXED at T.fix of the charge or at the red
// cue, whichever comes first (the brain's flare at the jaws, flashLead before it fires): from then the
// strip's ground heats. Lit (the beat's active frames + its sustain): the FIRST CONTACT in the active
// frames (30, knockdown, thrown along it; blocked: guard; rolled through: nothing, a plain dodge), then a
// TICK every T.tick (onSustain) on a hero still in the strip and not knocked down: at most T.maxTicks
// touch him (blocked or not; a tick his roll's i-frames take is not counted), the last throws him clear
// of its side; a held guard facing it pays T.guard.cost per tick, never health, and slides along it.
// After T.sweep.after s it sweeps toward the side the hero is on (on the line: away from where he is
// going) at T.sweep.rate deg/s, T.sweep.max deg at most, one way: rolling through it is safe. Every
// T.world.every s: destructibles.sweep along it, a trench of world.impact stations, world.ignite past the
// kerb; every paper self it touches pops. Then the fox throws its head back and goes up in embers, and
// he kneels (the recovery, his guard down: recoverOpen 1, + T.kneelPosture to his posture).
// The camera: every frame the Howl stands, cameraRig.hold (distance) and keep (the hero and the fox's
// head, both `must`): both in frame. A reset (or the move ending under him) takes all of it back.
// Fairness: the cue ledger holds the lit window as one interval (`sustain`); the first windup is the
// beam beat's 3.8 s; the glint flashLead before it fires is the brain's. `busy` is true from the start
// to the end of the fox's fade (the weather / the director read it).
// Look randomness: fx.kr() and steady hashes (fxBeam.js); game rolls (the sweep's side when the hero
// stands still on the line): Math.random, the AI's stream.

const DEG = Math.PI / 180;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const ease = (u) => u * u * (3 - 2 * u);
const sat = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const KERB = TERRACE.r + TERRACE.kerb;

export class FoxHowl {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.spirit = new FoxSpirit(d);
    this.stats = { howls: 0, first: 0, ticks: 0, blocked: 0, dodged: 0, thrown: 0, world: 0, popped: 0 };
    this.B = { fixed: false, on: false, ox: 0, oz: 0, yaw: 0, dx: 0, dz: 1, len: 0, w: 0, t: 0, swept: 0, sign: 0, taken: 0, first: false, fadeT: 0, k: 0, worldNext: 0 };
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._pl = { x: 0, z: 0 };
    this._stations = new Set();
    this._wo = { kind: 'blast', by: 'boss', dx: 0, dz: 0, y: 1.2, src: -1 };
    this._to = { kind: 'blast', by: 'boss', dx: 0, dz: 0, src: -1, scar: true, mark: 'beam', hot: true, len: NaN }; // (its trench: scars.mark `beam`, a station's stretch)
    this._st = { rise: 0, rear: 0, jaw: 0, turn: 0, fade: 0 };
    this._phase = 0;
    this._phaseAt = 0;
    this._blockEvt = -Infinity;
    this.used = false;
    this.lastAt = -Infinity;
    this._install();
    this.reset();
  }

  get T() {
    return this.d.T?.verdict ?? VERDICT;
  }

  /** The Lab / console: `d.debug.howl()` starts it now (in any phase); `d.debug.howlState()` reads it. */
  _install() {
    const d = this.d, dbg = d.debug;
    if (!dbg) return;
    dbg.howl = () => {
      if (d.mode === 'dying' || d.mode === 'dead' || d.mode === 'broken') return false;
      if (d.mode === 'sleep' || d.mode === 'intro') d.brain.startFight?.();
      return d.brain.startAct('foxVerdict', Math.max(3, d.phase));
    };
    dbg.howlState = () => ({ phase: this.phase, busy: this.busy, used: this.used, lastAt: this.lastAt, B: { ...this.B }, spirit: this.spirit.visible, stats: { ...this.stats } });
  }

  // ---------------------------------------------------------------- the routing contract
  /** Nothing lit, the spirit hidden, the terrace's light back, the camera let go. `used` / `lastAt`
   *  survive a mid-fight reset of the move only when `keepUse` (a new fight clears them). */
  reset(keepUse = false) {
    this.on = false;
    this.ph = 'off';
    this.A = null;
    this.B.on = false;
    this.B.fixed = false;
    this.B.first = false;
    this.B.taken = 0;
    this.B.k = 0;
    this._endT = -1;
    this._charged = false;
    this._knelt = false;
    this._placed = false;
    this._ended = false;
    this._stations.clear();
    if (!keepUse) {
      this.used = false;
      this.lastAt = -Infinity;
    }
    this.spirit?.reset();
    // the light back at once (world/foxTerrace.js light.reset)
    const L = this.game.world?.forest?.light;
    try {
      L?.reset?.(this.game);
    } catch (err) {
      console.error('[fox] howl light reset failed', err);
    }
  }

  get busy() {
    return this.on;
  }

  get phase() {
    return this.on ? this.ph : 'off';
  }

  weigh(name, def, w) {
    const T = this.T, now = this._now();
    if (this.d.phase < 3 || this.on) return 0;
    if (now - this._phaseAt < T.start || now - this.lastAt < T.every) return 0;
    return w;
  }

  /** The first time his bar is under T.forceAt in phase 3 (and he has not howled): now. */
  forced() {
    const d = this.d;
    if (this.used || this.on || d.phase < 3 || d.mode === 'dying' || d.mode === 'dead') return null;
    if (!(d.hp > 0) || d.hp > d.maxHp * this.T.forceAt) return null;
    return 'foxVerdict';
  }

  onActStart(A) {
    if (this.on && this.ph !== 'end') return false;
    if (this.on) this._finish();
    this.on = true;
    this.used = true;
    this.lastAt = this._now();
    this.A = A;
    this.ph = 'flit';
    this.B.on = false;
    this.B.fixed = false;
    this.B.first = false;
    this.B.taken = 0;
    this._charged = false;
    this._knelt = false;
    this._placed = false;
    this._ended = false;
    this._endT = -1;
    this._flitDone = false;
    this._stations.clear();
    this.stats.howls++;
    // (the director plans nothing out of his kneel: the move ends into footwork, the kneel kept whole)
    A.planned = true;
    return true;
  }

  beatMotion(b, u, s, dt) {
    const D = b.def, d = this.d;
    if (D.verdict === 'flit') {
      if (!this._flitDone && u >= (this.T.flitAt ?? 0.3)) {
        this._flitDone = true;
        this._flit(s);
      }
      return;
    }
    if (D.verdict !== 'beam' || u >= 1) return;
    // aim: at the hero until the line is fixed, then along it
    if (!this.B.fixed && s?.p) {
      const ang = Math.atan2(s.p.x - d.position.x, s.p.z - d.position.z);
      d.yaw = turnToward(d.yaw, ang, perPhase(d.T.move.trackTurn, d.phase) * 0.35 * Math.max(dt, 1e-4));
    } else if (this.B.fixed) d.yaw = this.B.yaw;
  }

  onImpact(b, s, a) {
    if (b.def.verdict !== 'beam') return;
    const B = this.B, d = this.d;
    if (!B.fixed) this._fix();
    d.yaw = B.yaw;
    B.on = true;
    B.t = 0;
    B.first = false;
    B.taken = 0;
    B.swept = 0;
    B.sign = 0;
    B.w = this.T.w;
    B.len = this.T.len;
    B.worldNext = 0;
    B.k = 1;
    this.ph = 'lit';
    this._stations.clear();
    this.game.shake?.(0.5);
    this.game.world?.forest?.ambience?.flare?.(1);
    this.spirit.jawPoint(this._v);
    d.emit?.('dragon:spell', { name: a?.name ?? 'foxVerdict', x: this._v.x, z: this._v.z });
  }

  onSustain(b, s, a, k) {
    if (b.def.verdict !== 'beam' || !this.B.on || this.ph !== 'lit') return;
    const p = this.game.player;
    if (!p?.alive || !p.position) return;
    if (this.B.taken < 0 || p.state === 'knockdown') return;
    if (this._inStrip(p.position.x, p.position.z, p.radius ?? 0.45)) this._tick(p);
  }

  /** Every frame after the brain. Never throws (a failure ends the Howl quietly). */
  frame(dt) {
    const d = this.d;
    if (d.phase !== this._phase) {
      this._phase = d.phase;
      this._phaseAt = this._now();
    }
    const L = this.game.world?.forest?.light;
    if (!this.on) {
      L?.update?.(dt, this.game);
      return;
    }
    try {
      this._frame(dt);
    } catch (err) {
      console.error('[fox] howl frame failed', err);
      this.reset(true);
    }
    L?.update?.(dt, this.game);
  }

  pose(dt) {
    if (!this.on) return;
    try {
      this._draw(dt);
    } catch (err) {
      console.error('[fox] howl draw failed', err);
    }
  }

  /** While the beam beat is his (its windup and lit window): where its cue is drawn, the jaws. */
  cuePoint(out) {
    if (!this.on || !this.spirit.visible || (this.ph !== 'charge' && this.ph !== 'lit' && this.ph !== 'summon')) return null;
    this.spirit.jawPoint(out);
    return Number.isFinite(out.x + out.y + out.z) ? out : null;
  }

  // ---------------------------------------------------------------- the move, frame by frame
  _frame(dt) {
    const d = this.d, A = this.A, T = this.T, B = this.B, st = this._st;
    const mine = !!A && d.brain.act === A && d.mode === 'act';
    // the move ended under him (a stagger, a break, his death, the Lab): it all goes out
    if (!mine && this.ph !== 'end') this._toEnd();
    if (this.ph === 'end') {
      this._endFrame(dt);
      return;
    }
    const bt = A.beats.find((b) => b.def.verdict === 'beam');
    if (!bt) {
      this._toEnd();
      return;
    }
    const t = A.t;
    // the beam beat a feint (the fairness guard could not clear it): it never lights
    if (bt.feint && t >= bt.impact) {
      this._toEnd();
      return;
    }
    if (t < bt.start) {
      this.ph = 'flit';
      return;
    }
    if (!this._placed) this._place(bt);
    const ks = sat((t - bt.start) / Math.max(0.05, T.summon));
    const uc = sat(1 - (bt.impact - t) / Math.max(0.05, T.charge));
    if (t < bt.impact) {
      this.ph = ks < 1 ? 'summon' : 'charge';
      // the line, fixed at T.fix of the charge or at the cue
      if (!B.fixed && (uc >= T.fix || bt.flashed)) this._fix();
      // the darkness of a charged blow: once, as the summoning starts; his body darkens to the cue
      if (!this._charged) {
        this._charged = true;
        d.emit?.('combat:charge', { source: 'dragon', attack: A.name, dur: Math.max(0.05, bt.flash - t), x: d.position.x, z: d.position.z });
      }
      if (t < bt.flash) {
        d.game?.blackout?.beat(); // (the blackout, ?black=: the charge keeps the picture dark)
        const W = TELL_STYLE.black.warn, k = sat((t - bt.start) / Math.max(0.05, bt.flash - bt.start));
        d.warnTell = TELL.BLACK;
        d.warn = Math.max(d.warn, W.from + (W.to - W.from) * k * 0.8);
      }
      // the fox: rises over T.spirit.rise of the summoning, rears and howls; the charge: reared, the
      // jaws wide; the last of it the head comes down at the line
      const S = T.spirit, kr = sat(ks / Math.max(0.1, S.rise));
      st.rise = ease(kr);
      st.rear = ks < 1 ? 0.4 * ease(sat((ks - S.rise * 0.7) / 0.3)) : 0.4 - 0.1 * ease(sat(uc / 0.5)) - 1.3 * ease(sat((uc - 0.8) / 0.2));
      st.jaw = ks < 1 ? 0.7 * sat((ks - S.rise) / 0.15) * (1 - 0.5 * sat((ks - S.rise - 0.15) / 0.1)) + 0.35 * sat((ks - 0.9) / 0.1) : 0.7 + 0.3 * sat(uc / 0.3);
      st.fade = 0;
      this._aimHead(B.fixed ? B.yaw : d.yaw);
    } else {
      // lit
      this._lit(dt, bt);
      st.rise = 1;
      st.rear = -1;
      st.jaw = 1;
      st.fade = 0;
      this._aimHead(B.yaw);
      if (t >= bt.end - 1e-6 || !B.on) this._toEnd();
    }
    this.spirit.frame(dt, st);
    this._hold(1);
    // the light drops as it rises, and on down as the dark sun gathers (all of it while it burns)
    this.game.world?.forest?.light?.dim?.(t < bt.impact ? T.dim * (0.55 * st.rise + 0.45 * ease(uc)) : T.dim);
  }

  /** The beam, lit: the first contact, the sweep, the world, the selves. */
  _lit(dt, bt) {
    const d = this.d, B = this.B, T = this.T, p = this.game.player;
    if (!B.on) return;
    B.t += dt;
    // the sweep: decided as it starts (toward the side the hero is on; on the line, away from where he
    // is going; standing still on it: a roll), one way, T.sweep.max deg at most
    const SW = T.sweep;
    if (B.t >= SW.after) {
      if (!B.sign) B.sign = this._sweepSide(p);
      const left = SW.max * DEG - Math.abs(B.swept);
      if (left > 0) {
        const st = Math.min(SW.rate * DEG * dt, left) * B.sign;
        B.swept += st;
        B.yaw = wrapAngle(B.yaw + st);
        B.dx = Math.sin(B.yaw);
        B.dz = Math.cos(B.yaw);
      }
    }
    d.yaw = B.yaw;
    // the first contact: in the active frames
    if (p?.alive && p.position && !B.first && B.t <= T.active + 1e-6 + dt * 0.5) {
      if (this._inStrip(p.position.x, p.position.z, p.radius ?? 0.45)) {
        B.first = true;
        this._firstContact(p);
      }
    }
    if (B.t > T.active + dt) B.first = true;
    // the world, every T.world.every s
    if (B.t >= B.worldNext) {
      B.worldNext += T.world.every;
      this._world();
    }
    // every paper self it touches pops
    const C = d.clones;
    if (C?.list) {
      for (let i = 0; i < C.list.length; i++) {
        const c = C.list[i];
        if (c?.alive && this._inStrip(c.x, c.z, 0.4)) this.stats.popped += C.popAt(i, c.x, 1, c.z, false, 'beam') | 0;
      }
    }
  }

  /** Into the end: the beam fades, the fox throws its head back and goes up in embers. */
  _toEnd() {
    if (this.ph === 'end') return;
    this.ph = 'end';
    this._endT = 0;
    this._endRear = this._st.rear;
    this.B.fadeT = 0;
    this.B.fixed = this.B.fixed && this.B.on;
    this._endBurst = false;
  }

  _endFrame(dt) {
    const T = this.T, st = this._st, B = this.B, d = this.d;
    this._endT += dt;
    const e = this._endT, thrown = 0.3, life = T.spirit.end ?? 1.1;
    if (B.on) {
      B.fadeT += dt;
      B.k = Math.max(0, 1 - B.fadeT / Math.max(0.05, T.look.fadeOut));
      if (B.k <= 0.02) B.on = false;
    }
    // the kneel's posture: as he drops (the recovery's start, if the move ran to it)
    const A = this.A;
    if (!this._knelt && A && d.brain.act === A && A.t >= A.recoveryStart) {
      this._knelt = true;
      d.addPosture?.(T.kneelPosture);
    }
    if (this.spirit.visible) {
      st.rear = this._endRear + (0.8 - this._endRear) * ease(sat(e / thrown));
      st.jaw = 0.6;
      st.fade = sat((e - thrown) / life);
      if (st.fade > 0 && !this._endBurst) {
        this._endBurst = true;
        this.spirit.frame(0, st);
        spiritEnd(this.d.fx, this.spirit);
      }
      this.spirit.frame(dt, st);
      this.game.world?.forest?.light?.dim?.(st.rise * T.dim * (1 - st.fade));
      this._hold(1 - st.fade);
    }
    if (!this.spirit.visible && !B.on) this._finish();
  }

  /** It is over: nothing of it left (the light eases back by itself; the camera lets go). */
  _finish() {
    this.on = false;
    this.ph = 'off';
    this.B.on = false;
    this.B.fixed = false;
    this.spirit.hide();
  }

  // ---------------------------------------------------------------- the pieces
  /** The flit: `T.away` m from the hero, away from him through the terrace's middle (toward the rim
   *  point farthest from him), never past `T.rim` from the middle (inside his bound); facing the hero.
   *  (Not all the way to the far rim: the fox, its head and the hero then fit one frame at about the
   *  fight's own distance, and the head is the size of a subject, not a corner.) */
  _flit(s) {
    const d = this.d, T = this.T, p = s?.p ?? this.game.player?.position;
    const x0 = d.position.x, z0 = d.position.z, px = fin(p?.x), pz = fin(p?.z);
    let ax = -px, az = -pz;
    let l = Math.hypot(ax, az);
    // (the hero at the middle: away from where the hero faces, else north)
    if (l < 0.5) {
      const py = this.game.player?.yaw;
      ax = Number.isFinite(py) ? -Math.sin(py) : 0;
      az = Number.isFinite(py) ? -Math.cos(py) : -1;
      l = Math.hypot(ax, az) || 1;
    }
    const R = Math.min(T.rim, d.bound - 0.3), D = T.away ?? 10;
    const a0 = Math.atan2(ax / l, az / l);
    let tx = px + Math.sin(a0) * D, tz = pz + Math.cos(a0) * D;
    // (a spot he may stand on: turned round the hero a little if this one is taken)
    for (const da of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8]) {
      let x = px + Math.sin(a0 + da) * D, z = pz + Math.cos(a0 + da) * D;
      const r = Math.hypot(x, z);
      if (r > R) {
        x *= R / r;
        z *= R / r;
      }
      if (!d.standable || d.standable(x, z)) {
        tx = x;
        tz = z;
        break;
      }
    }
    d.position.x = tx;
    d.position.z = tz;
    d.position.y = 0;
    d.moveBy(0, 0);
    d.yaw = Math.atan2(px - d.position.x, pz - d.position.z);
    if (d.object3d) d.object3d.rotation.y = d.yaw;
    d.anim?.teleported?.();
    d.fx?.flit?.(x0, z0, d.position.x, d.position.z);
  }

  /** The fox placed behind him, side-on to the camera, its jaws over the line behind him. */
  _place(bt) {
    const d = this.d, S = this.T.spirit, p = this.game.player?.position;
    this._placed = true;
    const aim = p ? Math.atan2(p.x - d.position.x, p.z - d.position.z) : d.yaw;
    const fx = Math.sin(aim), fz = Math.cos(aim);
    // its body faces east or west, whichever the line runs toward (its profile to the camera)
    this._face = fx >= 0 ? Math.PI / 2 : -Math.PI / 2;
    const jx = d.position.x - fx * S.behind, jz = d.position.z - fz * S.behind;
    this.spirit.place(jx, jz, this._face, this._pl);
    this.spirit.show(this._pl.x, this._pl.z, this._face);
    this._st.rise = 0;
    this._st.fade = 0;
    this._st.rear = 0;
    this._st.jaw = 0;
  }

  /** The head turned toward yaw `y` (spirit.js clamps it). */
  _aimHead(y) {
    this._st.turn = wrapAngle(fin(y) - fin(this._face));
  }

  /** The line is fixed: from him, along his aim. */
  _fix() {
    const d = this.d, B = this.B;
    B.fixed = true;
    B.ox = d.position.x;
    B.oz = d.position.z;
    B.yaw = d.yaw;
    B.dx = Math.sin(B.yaw);
    B.dz = Math.cos(B.yaw);
    B.len = this.T.len;
    B.w = this.T.w;
    B.fixedAt = this._now();
  }

  /** Is (x, z) in the strip (radius r added)? */
  _inStrip(x, z, r = 0) {
    const B = this.B;
    if (!B.fixed) return false;
    const ox = x - B.ox, oz = z - B.oz, along = ox * B.dx + oz * B.dz, across = -ox * B.dz + oz * B.dx;
    return along >= -r - 0.3 && along <= B.len + r && Math.abs(across) <= B.w / 2 + r;
  }

  /** The sweep's way (+1 / -1): toward the hero's side; on the line, away from where he is going. */
  _sweepSide(p) {
    const B = this.B;
    if (p?.position) {
      const ox = p.position.x - B.ox, oz = p.position.z - B.oz, across = -ox * B.dz + oz * B.dx;
      // (+yaw turns the line toward its left side, -dz/+dx's negative: across < 0 there)
      if (Math.abs(across) > B.w / 2 + (p.radius ?? 0.45)) return across < 0 ? 1 : -1;
      const v = p.vel ?? p.velocity, vx = fin(v?.x), vz = fin(v?.z), side = -vx * B.dz + vz * B.dx;
      if (Math.abs(side) > 0.5) return side < 0 ? -1 : 1;
      if (Math.abs(across) > 0.3) return across < 0 ? 1 : -1;
    }
    return Math.random() < 0.5 ? -1 : 1;
  }

  /** The hero faces the line's root or the beam where it lands (his guard's arc). */
  _facing(p) {
    const B = this.B, q = p.position, half = DEFENSE.blockArc * 0.5;
    const lx = B.ox + B.dx * this.T.land, lz = B.oz + B.dz * this.T.land;
    return facingDelta(p.yaw, q.x, q.z, B.ox, B.oz) <= half || facingDelta(p.yaw, q.x, q.z, lx, lz) <= half;
  }

  _firstContact(p) {
    const B = this.B, T = this.T, d = this.d;
    this.stats.first++;
    const r = d.hitPlayer({
      damage: T.first.damage, knockback: T.first.knockback, knockdown: true, kind: 'beam', tell: TELL.RED, attack: this.A?.name ?? 'foxVerdict',
      from: { x: B.ox, z: B.oz }, projectile: true, parryable: false, blockable: true, parryPosture: 0,
      // (rolled through it is a plain dodge: a perfect one's blink would drop the hero behind him at the
      // rim, in the fox; the roll itself is the move's best moment)
      extra: { perfect: false },
    });
    if (r === RESULT.BLOCKED) {
      // (the blocked head is not a tick: the guard still meets `maxTicks` sustained ticks after it, as a
      // hero who took the head does, so a full guard ends at 30 x 1.15 + 3 x 14 = 77 of 100)
      this.stats.blocked++;
      B.taken = 0;
    } else if (r === RESULT.HIT) B.taken = 0;
    else if (r === RESULT.DODGED || r === RESULT.PERFECT) this.stats.dodged++;
    return r;
  }

  /** A tick on a hero still in the strip: a stream (no stagger); a held guard pays guard, never health. */
  _tick(p) {
    const B = this.B, T = this.T, d = this.d;
    if (B.taken < 0) return;
    this.stats.ticks++;
    const last = B.taken + 1 >= T.maxTicks;
    if (p.blocking && this._facing(p)) {
      const cost = clamp(T.guard.cost, GUARD.costMin, GUARD.costMax);
      const ok = last ? this._clear(p, true) : typeof p.streamBlock === 'function' && p.streamBlock(cost, T.guard.push, B.dx, B.dz);
      if (ok) {
        this.stats.blocked++;
        B.taken = last ? -1 : B.taken + 1;
        this._blockFx(p);
        return;
      }
      // (the guard could not pay: it goes through the player's own block, which opens it; no health)
      d.hitPlayer({
        damage: T.tickDamage, knockback: 0.6, knockdown: false, kind: 'beam', tell: TELL.RED, attack: this.A?.name ?? 'foxVerdict',
        from: { x: B.ox, z: B.oz }, projectile: true, parryable: false, blockable: true, extra: { perfect: false },
      });
      B.taken++;
      return;
    }
    // (the player staggers on a no-knockback hit of 5 or more unless one came in the last 0.6 s: the
    // tick is dealt in parts under that, the first opens the stream; the last throws him out of its side)
    const scale = d.T.damageScale ?? 1, n = last ? 1 : Math.max(1, Math.ceil((T.tickDamage * scale) / 4.8));
    let from = { x: B.ox, z: B.oz };
    if (last) {
      const q = p.position, along = (q.x - B.ox) * B.dx + (q.z - B.oz) * B.dz;
      from = { x: B.ox + B.dx * along, z: B.oz + B.dz * along };
      if (Math.hypot(q.x - from.x, q.z - from.z) < 0.05) from = { x: from.x + B.dz * 0.3, z: from.z - B.dx * 0.3 };
    }
    let landed = false;
    for (let i = 0; i < n; i++) {
      const r = d.hitPlayer({
        damage: T.tickDamage / n, knockback: last ? T.thrown : 0, knockdown: last, kind: 'beam', tell: TELL.RED, attack: this.A?.name ?? 'foxVerdict',
        from, projectile: true, parryable: false, blockable: false, extra: { perfect: false },
      });
      if (r !== RESULT.HIT) break;
      landed = true;
    }
    if (!landed) {
      this.stats.dodged++;
      return;
    }
    if (last) {
      B.taken = -1;
      this.stats.thrown++;
    } else B.taken++;
  }

  /** A guarded hero slid out of the strip's nearer side (the last tick): no health, a little guard. */
  _clear(p, guarded) {
    const B = this.B, T = this.T, q = p.position;
    const ox = q.x - B.ox, oz = q.z - B.oz, across = -ox * B.dz + oz * B.dx, sd = across < 0 ? -1 : 1;
    const out = Math.max(0.6, B.w / 2 + (p.radius ?? 0.45) - Math.abs(across) + 0.8);
    const sx = -B.dz * sd, sz = B.dx * sd;
    const ok = typeof p.streamBlock === 'function' && p.streamBlock(clamp(T.guard.cost, GUARD.costMin, GUARD.costMax), out, sx, sz);
    if (ok) {
      B.taken = -1;
      this.stats.thrown++;
    }
    return ok;
  }

  _blockFx(p) {
    const B = this.B;
    const c = p.getChestPos?.(this._w, true);
    if (c) p.fx?.blockChip?.(c.x - B.dx * 0.45, c.y, c.z - B.dz * 0.45);
    this.game.shake?.(0.06);
    const now = this._now();
    if (now - this._blockEvt > 0.4) {
      this._blockEvt = now;
      this.game.events?.emit?.('player:block', { damage: 0, tell: 'normal' });
    }
  }

  /** The world along the strip (ADR-107): what stands in it, a trench in the floor, fire past the kerb. */
  _world() {
    const B = this.B, W = this.T.world, wd = this.game.world, D = wd?.destructibles;
    if (!wd || !B.fixed) return;
    this.stats.world++;
    const o = this._wo;
    o.dx = B.dx;
    o.dz = B.dz;
    o.y = W.y;
    if (D?.sweep) {
      o.src = D.swing?.() ?? -1;
      D.sweep(B.ox + B.dx * 0.6, B.oz + B.dz * 0.6, B.ox + B.dx * B.len, B.oz + B.dz * B.len, B.w * 0.5 + 0.2, W.sweep, o);
    }
    const t = this._to, step = W.step;
    t.dx = B.dx;
    t.dz = B.dz;
    t.src = D?.swing?.() ?? -1;
    for (let s = 1.2; s <= B.len; s += step) {
      const x = B.ox + B.dx * s, z = B.oz + B.dz * s;
      const key = Math.round(x / step) * 4096 + Math.round(z / step);
      if (this._stations.has(key)) continue;
      this._stations.add(key);
      wd.impact?.(x, z, W.impactR, W.impact, t);
      if (Math.hypot(x, z) > KERB + 0.3) wd.ignite?.(x, z, W.impactR + 0.5, W.ignite);
    }
  }

  // ---------------------------------------------------------------- the camera
  /** The hero and the fox's head both in frame (cameraRig.hold + keep), `k` 0..1 of it. */
  _hold(k) {
    const rig = this.game.cameraRig, p = this.game.player?.position, H = this.spirit.P?.head;
    if (!rig || !p || !H || !(k > 0.01)) return;
    const C = this.T.camera;
    if (Number.isFinite(H.x + H.y + H.z) && H.y > 0) {
      // (on a phone the pull-back is capped in its own metres, C.phone: the hero stays readable; the
      // frame then holds the hero and the head, and the tails run off it)
      const phone = !!rig.mobile, cap = phone ? C.phone / Math.max(0.1, fin(rig.defaultDistance, 20) / CONFIG.camera.distance) : C.maxZoom;
      const z = this._pairZoom(p, H, C.margin);
      // (the focus leaned toward the fox: half way from the hero to its head and chest)
      const Ch0 = this.spirit.P.chest, fxm = (H.x + Ch0.x) * 0.5, fzm = (H.z + Ch0.z) * 0.5;
      rig.hold?.(Math.min(cap, z) * ease(sat(k)), fxm, fzm, (phone ? C.leanPhone : C.lean) * ease(sat(k)));
      rig.keep?.(p.x, fin(p.y) + 1.0, p.z, 1.4, true);
      // (on a phone only the hero is a must: what does not fit of the fox is cropped, never the hero)
      rig.keep?.(H.x, H.y, H.z, phone ? 1.6 : 2.4, !phone);
      // (and its ears' tips: the head whole, not cut at the frame's top)
      const E = this.spirit.P.ear[0];
      if (!phone && Number.isFinite(E.x + E.y + E.z) && E.y > 0) rig.keep?.(E.x, E.y, E.z, 0.8, true);
      // (its chest too, when it fits: the fox, not only its head)
      const Ch = this.spirit.P.chest;
      if (!phone && Ch.y > 0) rig.keep?.(Ch.x, Ch.y, Ch.z, 3, false);
    }
  }

  /** The extra distance (desktop metres) that frames the hero and the head with `m` m round them. */
  _pairZoom(p, H, m) {
    const rig = this.game.cameraRig, cam = this.game.camera;
    const tanV = Math.tan(((Number.isFinite(cam?.fov) ? cam.fov : CONFIG.camera.fov) * Math.PI) / 360);
    const asp = Number.isFinite(cam?.aspect) && cam.aspect > 0.2 ? cam.aspect : 16 / 9;
    const pitch = fin(rig.pitch, CONFIG.camera.pitch), sp = Math.sin(pitch), cp = Math.cos(pitch);
    // (screen-up of a point: cos(pitch) y - sin(pitch) z; the hero's chest and the head's top)
    const E = this.spirit.P.ear[0], eu = Number.isFinite(E?.y + E?.z) ? cp * (E.y + 0.6) - sp * E.z : -Infinity;
    const upP = cp * 1.2 - sp * p.z, upH = Math.max(cp * (H.y + 1.6) - sp * H.z, eu);
    const hx = Math.abs(H.x - p.x) / 2 + m, hy = Math.abs(upH - upP) / 2 + m;
    const need = Math.max(hx / (tanV * asp * 0.86), hy / (tanV * 0.8));
    const base = fin(rig.targetDistance, CONFIG.camera.distance);
    return Math.max(0, need - base) * (CONFIG.camera.distance / Math.max(1, fin(rig.defaultDistance, CONFIG.camera.distance)));
  }

  // ---------------------------------------------------------------- the drawing
  _draw(dt) {
    const d = this.d, fx = d.fx, B = this.B, T = this.T, A = this.A, S = this.spirit;
    if (!fx) return;
    const bt = A?.beats?.find((b) => b.def.verdict === 'beam');
    const t = A?.t ?? 0;
    if (S.visible) spiritFire(fx, S, S.P.k, dt);
    if (this.ph === 'summon' || this.ph === 'charge') {
      const ks = bt ? (t - bt.start) / Math.max(0.05, T.summon) : 1;
      summonRing(fx, d.position.x, d.position.z, T.ring, ks, dt);
      if (this.ph === 'charge' && bt) {
        const uc = sat(1 - (bt.impact - t) / Math.max(0.05, T.charge));
        S.jawPoint(this._v);
        darkSun(fx, this._v.x, this._v.y, this._v.z, uc, dt);
        if (B.fixed) beamMark(fx, B.ox, B.oz, B.ox + B.dx * B.len, B.oz + B.dz * B.len, B.w, sat((this._now() - fin(B.fixedAt)) / 0.3), dt);
      }
    }
    if (B.on && B.fixed) {
      S.jawPoint(this._v);
      beamBody(fx, this._v.x, this._v.y, this._v.z, B.ox + B.dx * B.len, B.oz + B.dz * B.len, B.w, B.t, dt, B.k);
    }
  }

  _now() {
    return this.game.time ?? 0;
  }
}
