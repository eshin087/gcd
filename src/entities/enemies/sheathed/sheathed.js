import * as THREE from 'three';
import { DIM } from '../../player/model.js';
import { Duelist, HERO_SCALE } from '../duelist/duelist.js';
import { RESULT } from '../../../combat/rules.js';
import { SHEATH_LOADOUT, BLADE_SPAN, buildOffSheath, sheathLookNow } from './gear.js';
import { SHEATH_POSES } from './poses.js';
import { MOVES, MOVE_NAMES, CLIP, realise, counterMove } from './moves.js';
import { TUNING } from './tuning.js';
import { LINKS } from './links.js';
import { SheathFx } from './fx.js';
import { LateCuts } from './lateCuts.js';

// Lu Wusheng, the Sheathed (ADR-144, ADR-145; COMBAT.md → "The Sheathed"): a wandering swordsman whose
// blade stays in the scabbard until one blink-fast draw cut the hero must parry or die. A duelist on
// the shared engine (duelist/duelist.js, brain.js) with his own kit. What only he does is here:
//   THE SHEATH on the rig (`sheath`: 'carry' | 'settled' | 'drawn'): carried, the sheathed sword hangs in
//     his right hand by the scabbard (the engine's weapon: kit.blade spans it); settled, the right-hand
//     piece is hidden and a piece at his left wrist (posed along the clip's `lsw`) shows the scabbard with
//     the hilt in it, his right hand keyed onto the hilt; drawn, the bare blade shows in the right hand
//     (grown out of the hilt over the cut: scale.z) and the left-wrist piece is the empty scabbard. The
//     beat drives it (TUNING.draw: grip / out; the recovery's home / handOff). After any reaction that
//     leaves the blade out he re-sheathes before anything else (the manual move `resheathe`); he is
//     always sheathed in footwork, after a reset and after a phase change; broken, he kneels on the
//     drawn blade.
//   THE DRAW'S RULE: hitPlayer for a `draw` beat sends a lethal blow (TUNING.draw.lethal: maxHp × 1.5;
//     off: draw.damage), unscaled, with `breaksGuard` (a held guard is knocked open, never hurt); he
//     never draws on a hero who cannot answer (mayCue, the engine's honor gate) and no draw is cued within
//     draw.afterBlock s of a blocked one; a chain of draws ends on a block or a landed draw (`stopOn`); a
//     parried draw recoils him draw.caught s ('caught').
//   THE CUT AND THE GROVE: the cut is one white line (fx.js drawLine); the grove falls on the CLICK of the
//     re-sheathe, not on the cut (or the moment a parry, stagger or break interrupts it): the sweep along
//     the blade's part (TUNING.world.draw) and the wake beyond it (world.wake, wakeLen, wakeW, at cutY).
//   Phase 3's hanging cuts (lateCuts.js).

/** The engine's weapon segment (mutable: the live span by sheath state, BLADE_SPAN). */
const BLADE = { guard: BLADE_SPAN.carry.guard, tip: BLADE_SPAN.carry.tip };

/** Everything the shared duelist needs to be him (duelist.js: kit). */
export const SHEATHED_KIT = Object.freeze({
  id: 'sheathed',
  TUNING, MOVES, MOVE_NAMES, CLIP, realise,
  transitions: Object.freeze({ 2: 'thumbWidth', 3: 'heldBreath' }),
  counterMove,
  streakMove: () => 'leaves',
  loadout: SHEATH_LOADOUT,
  poses: SHEATH_POSES,
  blade: BLADE,
  OPEN: ['caught'],
  REACT: { caught: { travel: -0.7 } },
  // (body d, the Wanderer, is a slighter man: drawn 7 % smaller; visual only. 0: the engine's default)
  get scale() {
    return sheathLookNow() === 'd' ? HERO_SCALE * 0.93 : 0;
  },
});

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const segDist = (px, pz, ax, az, bx, bz) => {
  const ex = bx - ax, ez = bz - az, ll = ex * ex + ez * ez || 1;
  const u = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / ll));
  return Math.hypot(px - ax - ex * u, pz - az - ez * u);
};

export class Sheathed extends Duelist {
  constructor(game) {
    super(game, SHEATHED_KIT);
  }

  // ---------------------------------------------------------------- build
  /** His sword's colours (the materials left on today's path: the blade, the scabbard, its fittings). */
  _tint(M) {
    const fill = (m, r, g, b) => m?.uniforms?.uArtFill?.value.setRGB(r, g, b);
    fill(M.trim, 0.025, 0.022, 0.024); // the black lacquer scabbard and the hilt's fittings
    fill(M.facing, 0.55, 0.52, 0.46); // its pale throat and butt cap
    fill(M.armor, 0.52, 0.54, 0.58); // the bare blade
    fill(M.bevel, 0.8, 0.82, 0.86); // its edge
    if (M.armor?.uniforms?.uInk) M.armor.uniforms.uInk.value.setRGB(0.85, 0.88, 0.95);
    if (M.trim?.uniforms?.uInk) M.trim.uniforms.uInk.value.setRGB(0.22, 0.2, 0.2);
  }

  _makeFx() {
    return new SheathFx(this);
  }

  /** The sheath's pieces (named by gear.js) and the left-wrist piece. */
  _setup() {
    const r = this.rig, list = (name) => {
      const out = [];
      r.root.traverse((o) => {
        if (o.name === name) out.push(o);
      });
      return out;
    };
    const off = buildOffSheath(r.materials, 1);
    r.body.add(off.root);
    this.sheathParts = { carry: list('sheathCarry'), drawn: list('sheathDrawn'), blade: [...list('sheathBlade'), ...list('sheathEdge')], off: off.root, offHilt: off.hilt };
    this._offDir = new THREE.Vector3(0.2, -0.45, -0.87).normalize();
    this._mouth = new THREE.Vector3();
    this._hiltDir = new THREE.Vector3(0, 0.4, 0.9);
    this.sheath = null;
    this.lethal = TUNING.draw.lethal;
    this.lastBlockedDraw = -9;
    this.stats = { draws: 0, honorFeints: 0, blocked: 0, parried: 0, landed: 0, clicks: 0, wakes: 0 };
    this._setSheath('carry', true);
    const d = this;
    /** Lab: the lethal draw on / off (off: TUNING.draw.damage). */
    this.debug.lethal = (on) => {
      if (on !== undefined) d.lethal = !!on;
      return d.lethal;
    };
    /** Lab: the sheath's state now. */
    this.debug.sheath = () => d.sheath;
  }

  reset() {
    (this.late ??= new LateCuts(this)).reset();
    this._wake = this._wake ?? { live: false, ax: 0, az: 0, bx: 0, bz: 0, cx: 0, cz: 0, dx: 0, dz: 1 };
    this._wake.live = false;
    this._ring = this._ring ?? { live: false, x: 0, z: 0 };
    this._ring.live = false;
    this.lastBlockedDraw = -9;
    this._learned = false;
    super.reset();
    if (this.sheathParts) this._setSheath('carry', true);
  }

  /** He falls: the hero learns One Breath (ADR-146; game.unlocks, absent in the tests' worlds). */
  _die() {
    const fresh = this.mode !== 'dying' && this.mode !== 'dead';
    super._die();
    if (fresh) this._learned = !!this.game.unlocks?.grant?.('oneBreath');
  }

  /** The victory's one line (flow.js): only the fight that taught it. */
  victoryNote() {
    return this._learned ? 'YOU LEARNED ONE BREATH' : null;
  }

  /** His combo links (links.js). */
  get LINKS() {
    return LINKS;
  }

  // ---------------------------------------------------------------- the sheath
  /** Show the sheath as `s` ('carry' | 'settled' | 'drawn'); 'dragon:sheath' { state } on a change
   *  ('settle' as the hand takes the hilt, 'draw', 'click' as the blade goes home, 'carry'). */
  _setSheath(s, quiet = false) {
    const P = this.sheathParts;
    if (!P || s === this.sheath) return;
    const was = this.sheath;
    this.sheath = s;
    const carry = s === 'carry', drawn = s === 'drawn';
    for (const m of P.carry) m.visible = carry;
    for (const m of P.drawn) m.visible = drawn;
    for (const m of P.blade) m.visible = drawn;
    P.off.visible = !carry;
    for (const m of P.offHilt) m.visible = s === 'settled';
    const span = drawn ? BLADE_SPAN.drawn : BLADE_SPAN.carry;
    BLADE.guard = span.guard;
    BLADE.tip = span.tip;
    if (quiet) return;
    const state = drawn ? 'draw' : s === 'settled' ? (was === 'drawn' ? 'click' : 'settle') : 'carry';
    if (state === 'click') {
      this.stats.clicks++;
      this._onClick();
    }
    this.emit('dragon:sheath', { state });
  }

  /** What the sheath should show this frame (the beat and the recovery drive it). */
  _sheathWant() {
    const br = this.brain, a = br.act, D = this.T.draw, s = this.sheath;
    if (this.mode === 'broken') return 'drawn';
    if (this.mode === 'react') return s; // (a caught draw stays out; the re-sheathe comes after)
    if (this.mode !== 'act' || !a) return this.mode === 'foot' ? s : 'carry';
    const t = a.t;
    if (t >= a.recoveryStart) {
      if (!a._drew) return a._settled && t < a.recoveryStart + 0.05 ? 'settled' : 'carry';
      const r = (t - a.recoveryStart) / Math.max(0.05, a.end - a.recoveryStart);
      return r < D.home ? 'drawn' : r < D.handOff ? 'settled' : 'carry';
    }
    let cur = null;
    for (const b of a.beats) {
      if (t < b.end + 1e-6) {
        cur = b;
        break;
      }
    }
    if (!cur) return s;
    const Dd = cur.def;
    if (Dd.draw || Dd.bare) {
      if (cur.feint && Dd.draw) return t >= cur.start + D.grip * cur.W ? 'settled' : s === 'drawn' ? 'settled' : 'carry';
      if (t >= cur.impact - 1e-3) {
        a._drew = true;
        return 'drawn';
      }
      // (a chain of draws: re-sheathed in motion, the click a fifth into the next windup)
      if (s === 'drawn' && t < cur.start + 0.2 * cur.W) return 'drawn';
      return t >= cur.start + D.grip * cur.W || s !== 'carry' ? 'settled' : 'carry';
    }
    if (Dd.settle) {
      a._settled = true;
      return t >= cur.start + D.grip * cur.W ? 'settled' : 'carry';
    }
    return s === 'drawn' ? 'drawn' : 'carry';
  }

  /** The re-sheathe's click (or the moment it is interrupted): the grove falls along the cut. */
  _onClick() {
    const W = this._wake, R = this._ring, wd = this.game.world, Dz = wd?.destructibles, T = this.T.world;
    if (W.live) {
      W.live = false;
      this.stats.wakes++;
      if (Dz?.sweep) {
        const o = (this._wo ??= { kind: 'cut', by: 'boss', dx: 0, dz: 1, y: 1.15, src: -1 });
        o.dx = W.dx;
        o.dz = W.dz;
        o.y = T.cutY;
        o.src = Dz.swing?.() ?? -1;
        Dz.sweep(W.ax, W.az, W.bx, W.bz, T.wakeW, T.draw, o);
        o.src = Dz.swing?.() ?? -1;
        Dz.sweep(W.bx, W.bz, W.cx, W.cz, T.wakeW, T.wake, o);
      }
      // a long scar on the floor under the blade's own part
      const sc = wd?.scars;
      if (sc?.ground) for (const f of [0.25, 0.55, 0.85]) sc.ground(W.ax + (W.bx - W.ax) * f, W.az + (W.bz - W.az) * f, 0.55, W.dx, W.dz);
    }
    if (R.live) {
      R.live = false;
      if (Dz?.strike) {
        const o = (this._ro ??= { kind: 'cut', by: 'boss', dx: NaN, dz: NaN, y: 1.15, src: -1, only: 'wood' });
        o.src = Dz.swing?.() ?? -1;
        o.y = T.cutY;
        Dz.strike(R.x, R.z, T.ringR, T.ring, o);
      }
    }
  }

  /** The left-wrist piece: at the left hand, along the direction the pose left on the animator (`lsw`). */
  _poseOff(dt) {
    const off = this.sheathParts?.off;
    if (!off) return;
    const r = this.rig, fore = r.arms.L.fore;
    fore.updateWorldMatrix(true, false);
    _v.set(0, -DIM.foreArm - 0.02, 0.01).applyMatrix4(fore.matrixWorld);
    r.body.updateWorldMatrix(true, false);
    r.body.worldToLocal(_v);
    off.position.copy(_v);
    const o = this.anim.off ?? { az: 2.85, el: -0.55 };
    const c = Math.cos(o.el);
    _w.set(c * Math.sin(o.az), Math.sin(o.el), c * Math.cos(o.az));
    const k = dt > 0 ? 1 - Math.exp(-dt * 30) : 1;
    this._offDir.lerp(_w, k).normalize();
    _bz.copy(this._offDir);
    _by.set(0, 1, 0).addScaledVector(_bz, -_bz.y);
    if (_by.lengthSq() < 1e-6) _by.set(1, 0, 0);
    _by.normalize();
    _bx.crossVectors(_by, _bz);
    off.quaternion.setFromRotationMatrix(_m4.makeBasis(_bx, _by, _bz));
  }

  _gameplayPoints() {
    this._poseOff(this._dt ?? 0);
    super._gameplayPoints();
  }

  _animate(dt) {
    this._dt = dt;
    super._animate(dt);
  }

  /** Drawn points: the engine's blade (the live span) and the scabbard's mouth (the draw's cue sits there). */
  _drawnPoints() {
    super._drawnPoints();
    const off = this.sheathParts?.off;
    if (!off) return;
    off.updateWorldMatrix(false, false);
    this._mouth.setFromMatrixPosition(off.matrixWorld);
    // (the hilt points out of the mouth, back along the scabbard's -Z)
    this._hiltDir.set(0, 0, -1).transformDirection(off.matrixWorld);
    if (!Number.isFinite(this._mouth.x + this._mouth.y + this._mouth.z)) this._mouth.set(this.position.x, 1.0, this.position.z);
  }

  /** Where a beat's glint pops: a draw's flare through the scabbard's mouth (`part: 'hilt'`). */
  tellPoint(part, out) {
    if (part === 'hilt' && this._mouth && Number.isFinite(this._mouth.x)) return out.copy(this._mouth);
    return super.tellPoint(part, out);
  }

  // ---------------------------------------------------------------- the draw's rule (ADR-144)
  /** The honor gate: may a draw's cue be given now? Not on a hero knocked down, staggered or
   *  guard-open, dead, nor within draw.afterBlock s of a blocked draw. */
  mayCue(b) {
    if (!b?.def?.draw) return true;
    const p = this.game.player;
    if (!p || p.alive === false) return false;
    if (p.state === 'knockdown' || p.state === 'stagger' || p.state === 'dead') return false;
    if (this.time - this.lastBlockedDraw < this.T.draw.afterBlock) return false;
    return true;
  }

  /** The honor gate gave up waiting: the hand leaves the hilt (he gives the hero room: footwork). */
  onHonorFeint() {
    this.stats.honorFeints++;
    this.brain._toFoot(0.35);
  }

  /** A draw blocked or landed ends the chain (the engine's stopOn). */
  onStopOn(a, b, r) {
    if (r === RESULT.BLOCKED) {
      this.lastBlockedDraw = this.time;
      this.stats.blocked++;
    } else if (r === RESULT.HIT) this.stats.landed++;
  }

  hitPlayer(o) {
    const b = o?.beat;
    if (b?.def?.draw) {
      const p = this.game.player, ds = this.T.damageScale ?? 1;
      const dmg = this.lethal ? fin(p?.maxHp, 160) * 1.5 : this.T.draw.damage;
      this.stats.draws++;
      return super.hitPlayer({ ...o, damage: dmg / ds, extra: { ...(o.extra ?? null), breaksGuard: true } });
    }
    return super.hitPlayer(o);
  }

  /** A parried draw recoils him longer: he is caught with the blade out. */
  onParried(info = {}) {
    const a = this.brain.act, b = a?.striking ?? null, draw = !!b?.def?.draw;
    super.onParried(info);
    if (draw) {
      this.stats.parried++;
      if (this.mode === 'react' && this.brain.react?.kind === 'recoil') this.brain.startReact('caught');
    }
  }

  // ---------------------------------------------------------------- the beats' own work
  onImpact(b, s, a) {
    const D = b.def;
    if ((D.draw || D.bare) && a) a._drew = true; // (the blade is out from here: the recovery is its re-sheathe)
    this.fx.onBlow?.(b, s, a);
    if (D.draw || (D.bare && D.zone && a?.def?.transition)) this._cut(b, s, a);
    if (D.selfHit && D.pathHit) this._pathHit(b, s, a);
  }

  /** The cut's line and the wake, laid at the impact (the grove falls on the click). */
  _cut(b, s, a) {
    const T = this.T.world, D = b.def, z = D.zone, y = T.cutY;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let ax, az, bx, bz;
    if (D.pathHit && b._dash) {
      ax = b._dash.x;
      az = b._dash.z;
      bx = this.position.x;
      bz = this.position.z;
    } else if (z?.kind === 'ring') {
      // The Held Breath: a draw nobody sees; on the click every stalk round him falls
      this._ring.live = true;
      this._ring.x = this.position.x;
      this._ring.z = this.position.z;
      this.fx.drawLine(this.position.x - fz * 3, y, this.position.z + fx * 3, this.position.x + fz * 3, y, this.position.z - fx * 3, this.position.x + fz * 3, y, this.position.z - fx * 3);
      return;
    } else {
      const r = z?.r ?? 4;
      ax = this.position.x + fx * 0.4;
      az = this.position.z + fz * 0.4;
      bx = this.position.x + fx * r;
      bz = this.position.z + fz * r;
    }
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    const W = this._wake;
    W.live = true;
    W.ax = ax;
    W.az = az;
    W.bx = bx;
    W.bz = bz;
    W.cx = bx + ux * T.wakeLen;
    W.cz = bz + uz * T.wakeLen;
    W.dx = ux;
    W.dz = uz;
    this.fx.drawLine(ax, y, az, bx, y, bz, W.cx, y, W.cz);
  }

  /** A Thousand Li: the cut covers the path he crossed (selfHit: the engine gives no zone result). */
  _pathHit(b, s, a) {
    const p = this.game.player, pp = p?.position, D = b._dash;
    if (!pp || !D || b.feint) return;
    const w = (b.def.zone?.w ?? 1.3) * 0.5 + (p.radius ?? 0.45);
    if (segDist(pp.x, pp.z, D.x, D.z, this.position.x, this.position.z) > w) return;
    const r = this.hitPlayer({ damage: b.def.damage, knockback: b.def.knockback, kind: 'slash', tell: b.def.tell, attack: a.name, from: { x: D.x, z: D.z }, beat: b });
    if (r !== RESULT.IGNORED) {
      b.done = true;
      b.landed = r === RESULT.HIT;
      if (this.brain.act === a && b.def.stopOn) this.brain._stopOn(a, b, r);
    }
  }

  onCast(b, s, a) {
    if (b.def.cast?.kind === 'late') this.late.cast(b, s, a);
  }

  /** `?drawCut=b`: an afterimage of him where he stood, left as the cut leaves (the dash's frame). */
  beatMotion(b, u) {
    if (b.def.draw && b._dash && !b._ghosted && this.fx.drawCutLook?.() === 'b') {
      b._ghosted = true;
      const o = (this._gho ??= { dx: 0, dz: 0, life: 0.7, light: 0.4, ox: 0, oz: 0, ember: 0 });
      o.ox = b._dash.x - this.position.x;
      o.oz = b._dash.z - this.position.z;
      this.fx.ghost?.(this, o);
    }
    void u;
  }

  brainFrame(dt) {
    // the sheath follows the beat; out of a move with the blade out he re-sheathes before anything else
    let want = this._sheathWant();
    if (this.mode === 'foot' && this.sheath !== 'carry') {
      if (this.sheath === 'drawn' && this.brain.startAct('resheathe')) want = this._sheathWant();
      else want = 'carry';
    }
    // an interrupted re-sheathe (a parry, a stagger, a break, the honor gate): the grove falls now
    if ((this._wake?.live || this._ring?.live) && this.mode !== 'act') this._onClick();
    this._setSheath(want);
    this.late?.frame(dt);
  }

  afterPose(dt, a) {
    const fx = this.fx;
    // a scabbard blow's trail: dull wood
    if (a && this._tipOk && !this.shuddering && this.sheath === 'carry') {
      for (const b of a.beats) {
        if (b.feint || b.def?.noSweep || a.t < b.impact - 0.32 * b.W - 0.02 || a.t > b.end + 0.6 * b.A + 0.05) continue;
        fx.woodSweep(this._hiltPrev, this._tipPrev, this._hilt, this._tip);
        break;
      }
    }
    // a bare blade's blow (not a draw: its cut is drawn as one line): steel
    if (a && this._tipOk && !this.shuddering && this.sheath === 'drawn') {
      for (const b of a.beats) {
        if (b.feint || b.def?.draw || b.def?.noSweep || a.t < b.impact - 0.32 * b.W - 0.02 || a.t > b.end + 0.6 * b.A + 0.05) continue;
        fx.sweep(this._hiltPrev, this._tipPrev, this._hilt, this._tip, false);
        break;
      }
    }
    // the stillness: the pinpoint at the scabbard's mouth that grows into a thread through the cock
    if (a && this.sheath === 'settled' && this.mode === 'act') {
      const b = a.beats.find((x) => a.t < x.end + 1e-6);
      if (b && (b.def.draw || b.def.bare) && !b.feint && a.t < b.impact) {
        const c = b.start + (b.def.cock ?? 0.93) * b.W * 0.8;
        const k = Math.max(0, Math.min(1, (a.t - c) / Math.max(0.1, b.impact - c)));
        if (k > 0) fx.mouthGlint(this._mouth.x, this._mouth.y, this._mouth.z, this._hiltDir.x, this._hiltDir.y, this._hiltDir.z, k);
      }
    }
    // the wake hangs where it passed, until the click
    const W = this._wake;
    if (W?.live) fx.hairline(W.ax, this.T.world.cutY, W.az, W.cx, this.T.world.cutY, W.cz, 1);
    if (this.mode === 'broken') fx.stunStars(this._hs[0]);
  }

  /** The bare blade (his `armor` / `bevel` instances): it brightens through a cut. */
  _bladeMaterials(dt, M) {
    const fu = M.armor?.uniforms, tu = M.bevel?.uniforms;
    if (!fu) return;
    const act = this.brain.act, striking = !!act && act.striking && act.t >= act.striking.impact - 0.06 && act.t <= act.striking.end + 0.25;
    if (fu.uGlow) fu.uGlow.value = striking ? 0.6 : 0.05;
    if (fu.uInkGlow) fu.uInkGlow.value = striking ? 0.8 : 0.2;
    if (tu?.uGlow) tu.uGlow.value = striking ? 0.9 : 0.1;
  }
}
