import { TELL, RESULT } from '../../../combat/rules.js';
import { TUNING_TERRAIN } from './tuningTerrain.js';

// FsTerrain: the False Saint's use of the foundry (the TERRAIN AGENT's file; its moves: moves/terrain.js;
// its numbers: tuningTerrain.js). The hooks are the routing contract's (arsenal.js header has the list).
//
// CORE'S WORKING STUB (wave 0): THE MOLTEN POOLS' DAMAGE. The set lays the pools (its hazard surface,
// `game.world.forest.foundry`: molten.add / pools / at; world/lastFoundry.js); this handler, every frame:
//   - a NEW pool (one it has not seen: its `id`) is cued RED where it lies, `molten.arm` s ahead
//     (combat:tell with impactIn, combat:flash with `hazard`, the brain's ledger told: brain.expect), and
//     burns nothing before then;
//   - an armed pool burns the hero standing in it (r + pad) every `tick` s: d.hitPlayer (red, unblockable,
//     unparryable: a roll out of it, its i-frames, is the answer), `knockback` m out from its middle;
//   - and him: d.onMolten(boss, posture, x, z) at most once per `tick` (the level's trick: lure his shot,
//     cut a ladle's chain over him).
// THE SURFACE others may read: `stats` { pools, cued, heroBurns, bossBurns }.

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

export class FsTerrain {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T?.terrain ?? TUNING_TERRAIN;
    this._tell = { source: 'dragon', attack: 'molten', tell: TELL.RED, impactIn: 0, x: 0, z: 0, hazard: true };
    this._flash = { source: 'dragon', attack: 'molten', tell: TELL.RED, x: 0, y: 0.3, z: 0, hazard: true, flare: false };
    this._hit = { damage: 0, tell: TELL.RED, kind: 'burn', attack: 'molten', parryable: false, blockable: false, knockback: 0, knockdown: false, from: { x: 0, z: 0 }, light: true };
    this.reset();
  }

  reset() {
    this.stats = { pools: 0, cued: 0, heroBurns: 0, bossBurns: 0 };
    this._seen = -1; // the highest pool id seen
    this._heroT = 0; // s to the hero's next burn
    this._bossT = 0; // s to his next burn
  }
  stop() {}

  /** The set's hazard surface, or null (another set: the lab stage). */
  get foundry() {
    return this.game.world?.forest?.foundry ?? null;
  }

  frame(dt) {
    try {
      this._molten(fin(dt));
    } catch (err) {
      console.error('[saint] terrain frame', err);
    }
  }

  _molten(dt) {
    const F = this.foundry, M = this.T.molten;
    this._heroT = Math.max(0, this._heroT - dt);
    this._bossT = Math.max(0, this._bossT - dt);
    const pools = F?.molten?.pools;
    if (!pools || !M) return;
    const d = this.d, p = this.game.player;
    for (const P of pools) {
      if (!P?.alive) continue;
      if (P.id > this._seen) {
        this._seen = P.id;
        this.stats.pools++;
        this._cue(P, Math.max(0, M.arm - fin(P.t)));
      }
      if (fin(P.t) < M.arm) continue;
      // the hero in it
      if (p?.position && p.alive !== false && this._heroT <= 0 && Math.hypot(p.position.x - P.x, p.position.z - P.z) < P.r + M.pad + fin(p.radius, 0.45) * 0.5) {
        this._heroT = M.tick;
        const h = this._hit;
        h.damage = M.hero;
        h.knockback = M.knockback;
        h.from.x = P.x;
        h.from.z = P.z;
        if (d.mode !== 'dying' && d.mode !== 'dead' && d.hitPlayer(h) === RESULT.HIT) this.stats.heroBurns++;
      }
      // him in it
      if (this._bossT <= 0 && d.mode !== 'dying' && d.mode !== 'dead' && Math.hypot(d.position.x - P.x, d.position.z - P.z) < P.r + M.pad) {
        this._bossT = M.tick;
        if (d.onMolten?.(M.boss, M.posture, P.x, P.z) > 0) this.stats.bossBurns++;
      }
    }
  }

  /** A pool's red cue where it lies, `inS` s before it burns (the ledger, the HUD, the sound, the bots). */
  _cue(P, inS) {
    const d = this.d;
    if (d.mode === 'sleep' || d.mode === 'dying' || d.mode === 'dead') return;
    this.stats.cued++;
    if (inS > 0) {
      const t = this._tell;
      t.impactIn = inS;
      t.x = P.x;
      t.z = P.z;
      d.emit('combat:tell', t);
      d.brain?.expect?.(inS, TELL.RED, 'molten');
    }
    const f = this._flash;
    f.x = P.x;
    f.z = P.z;
    d.emit('combat:flash', f);
    d.fx?.hazardFlash?.(TELL.RED, P.x, 0.3, P.z, 1);
  }
}
