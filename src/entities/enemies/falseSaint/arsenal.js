import { TUNING_ARSENAL } from './tuningArsenal.js';

// FsArsenal: the False Saint's guns, lasers, cannons, missiles and artillery (the ARSENAL AGENT's file;
// its moves: moves/arsenal.js; its numbers: tuningArsenal.js; its drawings: fx.js / fxArsenal.js).
//
// THE HANDLER HOOKS (the routing contract, saint.js header; every one optional, called through `?.`; the
// full list, with arguments, for every handler of this boss):
//   beat (a beat routed here: one of its fields is in its file's FIELDS):
//     beatMotion(b, u, s, dt)   every frame of the beat's windup and action (u its windup share, may pass 1;
//                               s the brain's sense of the hero: { p, dx, dz, dist, ang })
//     onImpact(b, s, a)         its impact (a the act); replaces nothing: the engine's world blow and
//                               floor mark still run unless the beat is selfHit / cast
//     onRelease(b, s, a)        a `release` beat lets go
//     onCast(b, s, a)           a `cast` beat casts
//     onSustain(b, s, a, k)     a `sustain` beat's tick (k 0..1 through its life)
//     hitPlayer(o) → o          before the blow reaches the hero (change it; return the hit)
//     onHit(o, r)               after it did (r the player's RESULT)
//     onParried(info, b) → true the hero parried it: true = handled here (the engine's recoil skipped)
//     reach(b) → m | Infinity | undefined   how far it reaches (undefined: the engine's)
//   move (a move one of whose beats is routed here):
//     weigh(name, def, w, dist) → w   his AI weighs it (0: not now)
//     onActStart(A) → false     it is about to start: false refuses it
//   every handler, every frame / event:
//     frame(dt)                 after the brain (FalseSaint.brainFrame)
//     afterPose(dt, a)          after the pose (his points are fresh: d.handPoint, d.partPoint)
//     footwork(dt, s) → true    before the engine's footwork; true = it moved him this frame
//     takeHit(o) → o | false | undefined   a cut of the hero's, before the engine's: false = it does
//                               nothing (an armoured walk turns it aside); an object = the cut changed
//     stop()                    a reaction, a break, his death: let go of what it holds
//     reset()                   the fight's reset
// THE SURFACE others may read: `stats`. Empty today (wave 0).
export class FsArsenal {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T?.arsenal ?? TUNING_ARSENAL;
    this.reset();
  }
  reset() {
    this.stats = { shots: 0 };
  }
  stop() {}
  frame() {}
}
