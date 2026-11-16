import { damp } from '../../../core/math.js';
import { Duelist, HERO_SCALE } from '../duelist/duelist.js';
import { perPhase } from '../duelist/realise.js';
import { ASH_LOADOUT, JIAN } from './gear.js';
import { DUEL_POSES } from './poses.js';
import { MOVES, MOVE_NAMES, CLIP, realise } from './moves.js';
import { TUNING } from './tuning.js';
import { TerrainMoves } from './terrain.js';

// The Ash Disciple (docs/specs/ash-disciple.md): a grey-robed jian swordsman who fills the boss slot
// of the Ashfall level. A duelist (duelist/duelist.js: the body, the contract, the guard, posture,
// the duel's moments; duelist/brain.js: the mind and timeline) with his own kit: the moves as data
// (moves.js), the numbers (tuning.js), his gear (gear.js) and his clips (poses.js). What only he does
// is here: his colours, the blade kindled in phase 2 (its glow, its embers, the ember sweep trail),
// the Ash Crescent's sword qi, and the hooks of the moves that use the courtyard (terrain.js, ADR-111).

/** Everything the shared duelist needs to be him (duelist.js: kit). */
export const ASH_KIT = Object.freeze({
  id: 'ashDisciple',
  TUNING, MOVES, MOVE_NAMES, CLIP, realise,
  transitions: Object.freeze({ 2: 'kindle' }),
  loadout: ASH_LOADOUT,
  poses: DUEL_POSES,
  blade: JIAN,
});

export class AshDisciple extends Duelist {
  constructor(game) {
    super(game, ASH_KIT);
  }

  /** His colours: the hero's material set, recoloured on HIS instances (gear.js says which is which). */
  _tint(M) {
    const fill = (m, r, g, b) => m?.uniforms?.uArtFill?.value.setRGB(r, g, b);
    fill(M.coat, 0.36, 0.35, 0.33); // ash-grey robe: clearly lighter than the hero's black
    fill(M.lining, 0.12, 0.12, 0.125);
    fill(M.hem, 0.55, 0.53, 0.5); // the off-white collar and shin wraps
    fill(M.shirt, 0.05, 0.05, 0.055); // charcoal sash, bracer, shoes, the hat's binding
    fill(M.pants, 0.15, 0.15, 0.155);
    fill(M.leather, 0.44, 0.36, 0.2); // straw
    fill(M.trim, 0.32, 0.22, 0.11); // old bronze
    fill(M.facing, 0.55, 0.06, 0.05); // the red tassel
    fill(M.armor, 0.5, 0.52, 0.56); // the jian's pale steel (his gear wears no armour)
    fill(M.bevel, 0.7, 0.72, 0.76); // its ridge
    fill(M.hair, 0.05, 0.05, 0.06);
    if (M.armor?.uniforms) {
      M.armor.uniforms.uInk.value.setRGB(0.75, 0.78, 0.84);
      M.armor.uniforms.uEmissive.value.setRGB(1.6, 0.5, 0.1); // phase 2: the kindled blade (uGlow)
    }
    if (M.bevel?.uniforms) M.bevel.uniforms.uEmissive.value.setRGB(2.0, 0.75, 0.2);
    if (M.facing?.uniforms) M.facing.uniforms.uInk.value.setRGB(0.8, 0.12, 0.08);
  }

  reset() {
    this.kindle = 0; // phase 2's ember blade 0..1
    // (the base constructor resets before this class's own fields could exist: made here)
    (this.terrain ??= new TerrainMoves(this)).reset();
    super.reset();
  }

  // ---------------------------------------------------------------- the courtyard (terrain.js)
  /** The bound he keeps to in the duel (the level's). */
  get baseBound() {
    return super.bound;
  }
  /** ... stretched while a move takes him out to a piece of the set, and drawing back in after. */
  get bound() {
    return super.bound + (this.terrain?.slack ?? 0);
  }
  /** His AI weighs a move: one that needs a piece of the courtyard weighs nothing while none is in reach. */
  weigh(name, def, w) {
    return def.terrain ? this.terrain.weigh(def, w) : w;
  }
  /** A move starts: one of the courtyard's picks its piece (false: there is none, it does not start). */
  onActStart(A) {
    return A.def.terrain ? this.terrain.begin(A) : true;
  }
  beatMotion(b, u, s, dt) {
    if (this.brain.act?.def?.terrain) this.terrain.motion(b, u, s, dt);
  }
  onImpact(b, s, a) {
    if (a?.def?.terrain) this.terrain.impact(b, s, a);
    this.fx.onBlow?.(b, s, a); // what lands with the blow: the Kindling, a ring's shock, phase 3's afterimages (duelist/fx.js)
  }
  onCast(b, s, a) {
    if (a?.def?.terrain) this.terrain.cast(b, s, a);
  }

  // ---------------------------------------------------------------- the kindled blade (phase 2)
  /** It grows in through phase 2's transition. */
  brainFrame(dt) {
    // (held while a transition runs: the Kindling's kneel drives it from afterPose, the blade catching)
    if (this.phase >= 2 && !this.brain.act?.def?.transition) this.kindle = Math.min(1, this.kindle + dt * 1.5);
    this.terrain.frame(dt);
  }

  onTransitionEnd() {
    this.kindle = Math.max(this.kindle, 0.3);
  }

  /** Swing trails (ember once kindled, ash in phase 3), the Kindling's kneel, the kindled blade's
   *  embers, phase 3's ash on the wind, the stars of a break. */
  afterPose(dt, a) {
    const t1 = this._tip, h0 = this._hilt, fx = this.fx;
    // phase 3 (ash on the wind, duelist/fx.js ashWind): grows in over about a second
    this._ashK = this.phase >= 3 && this.mode !== 'dying' && this.mode !== 'dead' ? Math.min(1, (this._ashK ?? 0) + dt * 0.8) : 0;
    const ashLook = this._ashK > 0 ? (this.fx.ashLook?.() ?? 'a') : '';
    // the blade's sweep from the snap out of the cock through the follow-through (not through a
    // shudder: its flicker is no swing)
    if (a && this._tipOk && !this.shuddering) {
      for (const b of a.beats) {
        // (`noSweep`: a blow that is not the blade's: the kick)
        if (b.feint || b.def?.noSweep || a.t < b.impact - 0.32 * b.W - 0.02 || a.t > b.end + 0.6 * b.A + 0.05) continue;
        fx.sweep(this._hiltPrev, this._tipPrev, h0, t1, ashLook ? (ashLook === 'b' ? 'white' : 'ash') : this.phase >= 2);
        break;
      }
    }
    // the Kindling's kneel: the blade catches (on the blade only: a red blow shows nothing else
    // before its flare, ADR-118); at its impact it is alight
    if (a?.def?.transition && (a.def.phase ?? 2) === 2 && this._tipOk) {
      const b0 = a.beats[0];
      if (b0 && a.t < b0.impact) this.kindle = fx.kindleCharge?.(h0.x, h0.y, h0.z, t1.x, t1.y, t1.z, Math.max(0, Math.min(1, (a.t - b0.start) / Math.max(0.1, b0.impact - b0.start))), dt) ?? this.kindle;
      else this.kindle = 1;
    }
    // phase 3: the fire on the blade goes out into ash (a), burns white (b) or dies to cinders (c)
    if (ashLook === 'a' || ashLook === 'c') this.kindle = Math.max(ashLook === 'c' ? 0.15 : 0, this.kindle - dt * 2.3);
    if (this.kindle > 0.05 && this.mode !== 'dying') fx.emberBlade(h0.x, h0.y, h0.z, t1.x, t1.y, t1.z, dt, this.kindle);
    if (this._ashK > 0) fx.ashWind?.(this, dt, this._ashK);
    if (this.mode === 'broken') fx.stunStars(this._hs[0]);
  }

  /** The jian (his `armor` + `bevel` instances): pale steel that brightens through a strike; kindled
   *  in phase 2, its ink burns ember and it glows; in phase 3 (`?ashp3=`) its fire goes out to pale
   *  steel (a), burns white-hot (b) or smoulders dark (c). */
  _bladeMaterials(dt, M) {
    const k2 = this.kindle;
    const fu = M.armor?.uniforms, tu = M.bevel?.uniforms;
    if (!fu) return;
    const act = this.brain.act, striking = !!act && act.striking && act.t >= act.striking.impact - 0.06 && act.t <= act.striking.end + 0.1;
    const w = this._ashK > 0 && (this.fx.ashLook?.() ?? 'a') === 'b' ? this._ashK : 0; // white-hot
    const glow = 1.3 * k2 + (striking ? 0.35 : 0) + 0.4 * w;
    fu.uGlow.value = dt > 0 ? damp(fu.uGlow.value, glow, 14, dt) : glow;
    fu.uInkGlow.value = 0.15 + (striking ? 0.45 : 0) + 0.8 * k2 + 0.4 * w;
    fu.uInk.value.setRGB(0.75 + 0.7 * k2 + 0.5 * w, 0.78 - 0.15 * k2 + 0.75 * w, 0.84 - 0.6 * k2 + 0.9 * w);
    if (fu.uEmissive) fu.uEmissive.value.setRGB(1.6 + 0.6 * w, 0.5 + 1.4 * w, 0.1 + 1.6 * w);
    if (fu.uGlowMask) fu.uGlowMask.value = 1;
    if (tu) {
      tu.uGlow.value = fu.uGlow.value;
      tu.uInkGlow.value = fu.uInkGlow.value + 0.25;
      if (tu.uGlowMask) tu.uGlowMask.value = 1;
    }
  }

  // ---------------------------------------------------------------- the Ash Crescent
  /** Sword qi along the ground toward the hero (P2: a fan). */
  onRelease(b, s, act) {
    const R = b.def.release;
    const n = perPhase(R.count, this.phase);
    const base = s ? s.ang : this.yaw;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * R.spread;
      const sx = this.position.x + Math.sin(a) * 1.0, sz = this.position.z + Math.cos(a) * 1.0;
      this.fx.throwCrescent(sx, sz, Math.sin(a), Math.cos(a), { tell: b.def.tell, damage: b.def.damage, knockback: b.def.knockback, attack: act?.name ?? 'ashCrescent' });
    }
  }
}

export { HERO_SCALE };
