import { AscFx } from '../ascendant/fx.js';
import * as ARSENAL_FX from './fxArsenal.js';
import * as FX_DEBUG from './fxDebug.js';

// The False Saint's effects (the FX AGENT's file): Tian Lei's AscFx (the beam's helpers, the crater, the
// kept lights, every draw on its own stream) under his own surface. Everything that glows or strikes as a
// body is heat in the fire field (game.fx.fire); small things that fly are glyph particles of one letter
// cell (sparks, flakes, casings); nothing is a big glyph sprite (STYLE.md "The fire field"). Look jitter
// comes from lr() / hashes, never from Math.random or the stream game code reads. Sounds ride
// `dragon:spell { name: 'fs…', x, z, dur }` (this._say) emitted by the effects, never by the moves.
// Positions are world metres; `d` the boss; `k` 0..1 a strength / progress; `dt` the frame's.
//
// WAVE 0: every method below EXISTS and DRAWS NOTHING (the moves agents call them from the first commit;
// the fx agent fills them, keeping the names and the arguments). A method a move needs that is not here:
// add it here, as a stub, first. Inherited and kept (AscFx / LordFx / DuelFx): shock, crater, dust,
// hitSpark, muzzle, beam, beamCharge, ghost, dashGhost, limbTrail, hazardFlash, stunStars ...
//
// THE SURFACE (C = the caller calls it every frame while the thing lives; 1 = once):
//   THE BODY (the body's points: d.partPoint(name, out), d.eyePoint(out), d.handPoint(side, out))
//   jet(part, k)                        C  a booster lit at `part` ('elbowR' | 'elbowL' | 'back' | 'calfR' |
//                                          'calfL' | 'palmR'), k 0..1 (the booster punch's tell is this)
//   jetBurst(x, z, dx, dz, k)           1  the kick of a jet launch at (x, z) along (dx, dz): scorch, grit
//   afterimage(d, dx, dz, life)         1  a figure left where he was, drifting along (dx, dz) (Halcyon's)
//   dashTrail(ax, az, bx, bz, k)        1  a jet streak's line on the floor (the booster dash, Vespers)
//   sensor(k)                           C  his sensor(s) lit (k 0..1; how many by d.dressPhase: 1 from P2, 3 in P4)
//   sensorOut(i)                        1  the death: sensor i (0..2) goes out
//   shellFlake(point, cut, k)           1  a chip of his shell at world point {x,y,z}, `cut` {x, z} the
//                                          blade's travel, k the exposure it took (d.shell.last)
//   shellStrip(x, y, z, k)              1  a burn of shell off him (molten, a transition)
//   coreVent(k)                         C  the chest core's vent (P4's change, Last Rite's whine), k 0..1
//   transition(n, u)                    C  the change into phase n, u 0..1 through its windup
//   transitionBurst(n, x, z, r)         1  its impact: the burst ring from (x, z), r m
//   THE LASERS
//   sightLine(ax, az, bx, bz, k)        C  the thin cyan sight line before a cut (k 0..1 to the fire)
//   laser(ax, ay, az, bx, by, bz, k)    C  the white-hot cutting line, k its strength
//   scar(ax, az, bx, bz, w, k)          1  a hot scar left on the plates along a line, w m wide
//   THE CANNONS
//   cannonCharge(part, k)               C  the palm's iris ('palmR') / the core ('core') charging, k 0..1
//   cannonBeam(ax, ay, az, bx, by, bz, w, k)  C  the held incinerating beam, w m wide
//   cannonEnd(ax, az, bx, bz, w)        1  the beam ends: its trench glows and cools
//   THE BOLTS
//   gunFlash(x, y, z, dx, dz)           1  the forearm gun fires (casings: glyph particles)
//   bolt(b)                             C  a bolt in flight, b { x, y, z, dx, dy, dz, k }
//   boltHit(x, y, z, k)                 1  a bolt bites what it hits
//   THE MISSILES
//   missileLaunch(x, y, z, n)           1  the shoulder petals open and n leave
//   missile(m)                          C  a missile in flight, m { x, y, z, vx, vy, vz, k }
//   missileMark(x, z, r, k)             C  the ring marked where one comes down (k 0..1 to its landing)
//   blast(x, z, r, power)               1  a missile's blast
//   THE ARTILLERY
//   shellMark(x, z, r, k)               C  a marked shell of the creeping barrage (k 0..1 to its landing)
//   shellFall(x, y, z, k)               C  the shell coming down
//   shellBurst(x, z, r, power)          1  its burst (the great shell: a larger r and power)
//   THE LANCE
//   reticle(x, z, k, locked)            C  the reticle following the hero (k 0..1 to the lock)
//   skyLance(x, z, r, k)                C  the pillar of light (k 0..1 through its life)
//   THE FOUNDRY
//   pour(x, y, z, k)                    C  molten steel falling from a ladle (k its flow)
//   sparks(x, y, z, dx, dz, n, k)       1  n metal sparks off (x, y, z) along (dx, dz)
//   DEBUG
//   drive / step through fxDebug.js (dragon.debug.fx(name, opts))

/** Every drawing method of the surface (the stub list; saint.mjs FX checks each exists). */
export const FS_FX_METHODS = Object.freeze([
  'jet', 'jetBurst', 'afterimage', 'dashTrail', 'sensor', 'sensorOut', 'shellFlake', 'shellStrip', 'coreVent', 'transition', 'transitionBurst',
  'sightLine', 'laser', 'scar', 'cannonCharge', 'cannonBeam', 'cannonEnd', 'gunFlash', 'bolt', 'boltHit',
  'missileLaunch', 'missile', 'missileMark', 'blast', 'shellMark', 'shellFall', 'shellBurst', 'reticle', 'skyLance', 'pour', 'sparks',
]);

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

export class FsFx extends AscFx {
  constructor(d) {
    super(d);
    this.arsenalFx = ARSENAL_FX;
    this._arsenalState = ARSENAL_FX.createState?.() ?? null;
    this._drive = null; // fxDebug's timeline (dragon.debug.fx)
  }

  /** One-shot sound of an effect (audio.js maps `dragon:spell` names starting with 'fs'). */
  _say(name, x, z, extra = 0) {
    try {
      this.d?.emit?.('dragon:spell', { name, x: fin(x), z: fin(z), dur: fin(extra) });
    } catch (err) {
      console.error('[saint] fx sound', err);
    }
  }

  reset() {
    super.reset();
    this._drive = null;
    ARSENAL_FX.resetState?.(this, this._arsenalState);
  }

  update(dt, d) {
    super.update(dt, d);
    const fdt = Math.max(0, Math.min(0.1, fin(this.game.fxDt, dt)));
    if (this._drive) {
      try {
        if (FX_DEBUG.step?.(d, this._drive, fdt) === false) this._drive = null;
      } catch (err) {
        console.error('[saint] fxDebug step', err);
        this._drive = null;
      }
    }
    ARSENAL_FX.update?.(this, this._arsenalState, fdt, d);
  }

  // ---------------------------------------------------------------- THE BODY (stubs: the fx agent's)
  jet() {}
  jetBurst() {}
  afterimage() {}
  dashTrail() {}
  sensor() {}
  sensorOut() {}
  shellFlake() {}
  shellStrip() {}
  coreVent() {}
  transition() {}
  transitionBurst() {}
  // ---------------------------------------------------------------- THE LASERS
  sightLine() {}
  laser() {}
  scar() {}
  // ---------------------------------------------------------------- THE CANNONS
  cannonCharge() {}
  cannonBeam() {}
  cannonEnd() {}
  // ---------------------------------------------------------------- THE BOLTS
  gunFlash() {}
  bolt() {}
  boltHit() {}
  // ---------------------------------------------------------------- THE MISSILES
  missileLaunch() {}
  missile() {}
  missileMark() {}
  blast() {}
  // ---------------------------------------------------------------- THE ARTILLERY
  shellMark() {}
  shellFall() {}
  shellBurst() {}
  // ---------------------------------------------------------------- THE LANCE
  reticle() {}
  skyLance() {}
  // ---------------------------------------------------------------- THE FOUNDRY
  pour() {}
  sparks() {}
}
