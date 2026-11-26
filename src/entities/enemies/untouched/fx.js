import * as THREE from 'three';
import { AscFx } from '../ascendant/fx.js';
import { K_VOID, K_STEEL } from '../duelist/fx.js';
import * as SPELL_FX from './fxSpells.js';
import * as DOMAIN_FX from './fxDomain.js';

// Bai Wuji's effects (the FX AGENT's file): Tian Lei's AscFx (the beam's body, the splash, the crater,
// the vanish, the limb trails, the kept lights; every draw on its own stream) under his own surface.
// TODAY THE SURFACE IS FIXED AND MOSTLY EMPTY: every method below exists, is safe to call every frame
// (never throws, no allocation), and does little (the stand-in draws a few: noted). The rules (barrier.js,
// pull.js, domain.js, untouched.js) and the later moves call them through `?.`; the fx agent fills them
// (here, or in fxSpells.js / fxDomain.js: namespaces this class calls through `?.`, fn(this, ...args)).
// The palettes (render/firePalettes.js `azure`, `crimson`) and the slot swaps (void: azure while a
// knot lives, violet for the Null; fire: crimson for the fight, restored on reset / death / leaving)
// are the fx agent's: AscFx's constructor puts its gold in the void slot today.
// Positions are world metres; `d` the boss; `k` 0..1 a strength / progress; `dt` the frame's.
//
//   THE BARRIER (barrier.js; its state: d.barrier.up / cracks / openT / openDur)
//   barrierIdle(d, dt)                  every frame: the shell while it is up (faint), its cracks, the open state
//   barrierStop(point, dir, heavy)      the blade stopped on the shell at `point` {x,y,z}, `dir` {x,z} its way in (a ripple)
//   barrierCrack(n, of)                 an ordinary parry added a crack: n of `of`
//   barrierOpen(d)                      it breaks open (a perfect answer, the cracks, a posture break)
//   barrierClose(d)                     it closes again (the timer ran out)
//   THE BODY
//   blinkOut(d)                         he vanishes from where he stands (before the move)
//   blinkIn(d)                          he is there (after the move)
//   eyes(d, k)                          his eyes burn (k 0..1; every frame while k > 0)
//   afterimage(d, dx, dz, life)         a figure left where he was (the stand-in draws it: DuelFx.ghost)
//   THE SPELLS (the spells agent calls them)
//   drawKnot(knot, dt)                  an Azure Draw knot alive this frame (knot: pull.js record {x, z, r, strength, t, life})
//   drawCollapse(knot)                  the knot collapses (its crush)
//   castPoint(p, dt)                    a Crimson Cast point alive this frame (p {x, y, z, k})
//   castBurst(x, z, r, power)           its burst
//   nullCharge(d, k, blue, red)         the merge over his fingers: k 0..1; blue / red {x,y,z} the two points
//   nullBeam(seg, k)                    the Violet Null lit: seg {ax, az, bx, bz, w}, k 0..1 through its life
//   nullEnd(seg)                        it is over (the trench is the world's)
//   THE DOMAIN (domain.js)
//   domainSign(d, k)                    the hand sign (k 0..1 through its beat)
//   domainWall(x, z, r, k)              the sphere's wall at radius r round (x, z), k 0..1 its close
//   domainCaught(hero, k)               the hero held inside (k 0..1 through the hold)
//   domainBreak(x, z)                   the void breaks (his death): the crossing returns
//   (the void's air, its stars, is the SET's ambience: world/veiledCrossing.js)
//   WEIGHT
//   shove(x, z, dx, dz, dist)           a blocked blow slid the hero dist m along (dx, dz) from (x, z): dust
//   crash(x, z, dx, dz, power)          a thrown hero went through a piece at (x, z)

export class WjFx extends AscFx {
  constructor(d) {
    super(d);
    this.spellFx = SPELL_FX;
    this.domainFx = DOMAIN_FX;
  }

  // ---------------------------------------------------------------- the barrier
  barrierIdle(d, dt) {
    void d, dt;
  }
  barrierStop(point, dir, heavy = false) {
    if (!point || !Number.isFinite(point.x + point.y + point.z)) return;
    // (the stand-in: a few steel sparks where the blade stopped)
    this.hitSpark?.(point.x, point.y, point.z, fin(dir?.x), fin(dir?.z), !!heavy);
  }
  barrierCrack(n, of) {
    void n, of;
  }
  barrierOpen(d) {
    void d;
  }
  barrierClose(d) {
    void d;
  }

  // ---------------------------------------------------------------- the body
  blinkOut(d) {
    void d;
  }
  blinkIn(d) {
    void d;
  }
  /** His eyes (the stand-in: two points of the void slot's heat, steel hearts as k rises). */
  eyes(d, k) {
    if (!this.fire || !d || !(k > 0.02)) return;
    const e = d.eyePoint?.(this._eye ?? (this._eye = new THREE.Vector3()));
    if (!e || !Number.isFinite(e.x + e.y + e.z)) return;
    const life = this._frame();
    if (!(life > 0)) return;
    const rx = Math.cos(d.yaw), rz = -Math.sin(d.yaw);
    for (const s of [-1, 1]) {
      const ex = e.x + rx * 0.045 * s, ez = e.z + rz * 0.045 * s;
      this._blob(ex, e.y, ez, 0, 0, 0, life, 0.1 + 0.1 * k, 0.1 + 0.1 * k, 0.4 + 0.5 * k, 0.4 + 0.5 * k, K_VOID);
      if (k > 0.4) this._blob(ex, e.y, ez, 0, 0, 0, life, 0.06, 0.06, 0.5, 0.5, K_STEEL);
    }
  }
  /** A figure of steel left where he was (DuelFx.ghost), drifting the way he went. */
  afterimage(d, dx = 0, dz = 0, life = 0.4) {
    if (!d) return 0;
    return this.ghost(d, this._ghostOpt(dx, dz, life, 0, 0, 0, 0, 0, 0));
  }

  // ---------------------------------------------------------------- the spells
  drawKnot(knot, dt) {
    this.spellFx.drawKnot?.(this, knot, dt);
  }
  drawCollapse(knot) {
    this.spellFx.drawCollapse?.(this, knot);
  }
  castPoint(p, dt) {
    this.spellFx.castPoint?.(this, p, dt);
  }
  castBurst(x, z, r, power) {
    this.spellFx.castBurst?.(this, x, z, r, power);
  }
  nullCharge(d, k, blue, red) {
    this.spellFx.nullCharge?.(this, d, k, blue, red);
  }
  nullBeam(seg, k) {
    this.spellFx.nullBeam?.(this, seg, k);
  }
  nullEnd(seg) {
    this.spellFx.nullEnd?.(this, seg);
  }

  // ---------------------------------------------------------------- the domain
  domainSign(d, k) {
    this.domainFx.domainSign?.(this, d, k);
  }
  domainWall(x, z, r, k) {
    this.domainFx.domainWall?.(this, x, z, r, k);
  }
  domainCaught(hero, k) {
    this.domainFx.domainCaught?.(this, hero, k);
  }
  domainBreak(x, z) {
    this.domainFx.domainBreak?.(this, x, z);
  }

  // ---------------------------------------------------------------- weight
  shove(x, z, dx, dz, dist) {
    void x, z, dx, dz, dist;
  }
  crash(x, z, dx, dz, power) {
    void x, z, dx, dz, power;
  }
}

function fin(v, d = 0) {
  return Number.isFinite(v) ? v : d;
}
