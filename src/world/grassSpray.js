import { LetterBatch } from './life/letterBatch.js';
import { GRASS } from './grassTuning.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';

// The grass spray (round 5; `?grassSpray=a|b|c`, `0` none): when the sword's drawn arc cuts the grass
// (world/mowFx.js cutArc, the frame the arc passes), a spray of grass letters bursts off the cut along
// the swing: the grass's own strokes in the house letter (the wyrm's pixel font, LetterBatch: one 5 x 8
// px cell each at 720p, crisp at any distance), a lighter fresh green or a pale straw at the cut, never
// white. They are thrown along the swing and up, flutter, fall within about a second, and some settle
// and lie a moment. Visible by their count, their clump and their motion, not by size or glow.
// No allocation per frame; no Math.random (the module's own stream; built through mowFx's local one).

/** The spray's strength (`?grassSpray=a|b|c|0`): read once when the world is built. */
export const sprayLook = () => {
  const v = lookOf('grassSpray', GRASS.spray.look);
  return v === 'a' || v === 'a2' || v === 'a0' || v === 'b' || v === 'c' || v === 'm' || v === 'm2' || v === 'm3' ? v : '0';
};

let seed = 0x6a09e667;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + (b - a) * rnd();
const FLY = 0, LIE = 1;
const PF = 14; // x y z vx vy vz age life col tint ph lie state alpha

export class GrassSpray {
  /** `look` 'a' | 'b' | 'c' (GRASS.spray[look]: how many letters a cut blade throws). */
  constructor(game, look) {
    const S = GRASS.spray;
    this.game = game;
    this.look = look;
    this.T = S[look];
    this.max = S.max;
    this.batch = new LetterBatch(game, S.max, S.glyphs, { rand: rnd });
    this.batch.uniforms.uSoft.value = 0.25;
    game.pipeline?.registerParticles?.(this.batch);
    this._cols = [...S.glyphs].map((c) => this.batch.col(c));
    this.p = new Float32Array(S.max * PF);
    this.n = 0;
    this._acc = 0;
    this.total = 0; // letters thrown (the tests', the Lab's)
    this._c = [0, 0, 0];
    this.time = 0;
  }

  _q() {
    const q = this.game.world?.quality;
    return Number.isFinite(q) ? Math.max(0.3, q) : 1;
  }

  /**
   * A blade was cut at (x, z), its top `h` m up, by an arc stroke going (ux, uz) (unit, on the ground):
   * it throws GRASS.spray[look].per letters on average (fractions carried to the next blade).
   */
  cut(x, h, z, ux, uz) {
    const T = this.T, S = GRASS.spray, q = this._q();
    // (a phone draws fewer blades, so fewer are cut: each throws more, `lowQ` of the way back)
    this._acc += T.per * Math.pow(1 / Math.max(0.4, q), S.lowQ);
    const cap = Math.round(this.max * q);
    while (this._acc >= 1) {
      this._acc -= 1;
      if (this.n >= cap) return;
      const k = this.n++ * PF, d = this.p;
      const fl = R(S.fling[0], S.fling[1]), side = R(-1, 1) * S.side;
      d[k] = x + R(-0.08, 0.08);
      d[k + 1] = h * R(0.45, 1.0);
      d[k + 2] = z + R(-0.08, 0.08);
      d[k + 3] = ux * fl - uz * side;
      d[k + 4] = R(S.up[0], S.up[1]);
      d[k + 5] = uz * fl + ux * side;
      d[k + 6] = 0;
      d[k + 7] = R(S.life[0], S.life[1]);
      d[k + 8] = this._cols[Math.floor(rnd() * this._cols.length)];
      d[k + 9] = rnd(); // 0: fresh green .. 1: straw
      d[k + 10] = rnd() * 6.2832;
      d[k + 11] = R(S.lie[0], S.lie[1]);
      d[k + 12] = FLY;
      d[k + 13] = R(S.alpha[0], S.alpha[1]);
      this.total++;
    }
  }

  clear() {
    this.n = 0;
    this._acc = 0;
    this.batch.empty();
  }

  update(dt) {
    const b = this.batch, S = GRASS.spray, d = this.p;
    b.begin();
    if (dt > 0) this.time += dt;
    const drag = Math.exp(-S.drag * (dt > 0 ? dt : 0)), g = S.gravity, fz = S.flutter;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      let k = i * PF;
      if (dt > 0) {
        d[k + 6] += dt;
        if (d[k + 12] === FLY) {
          // tumbling down: drag, a fall, a flutter across the way it goes
          const ph = d[k + 10] + d[k + 6] * S.flutterHz;
          d[k + 3] = d[k + 3] * drag + Math.cos(ph) * fz * dt;
          d[k + 5] = d[k + 5] * drag + Math.sin(ph * 0.7) * fz * dt;
          d[k + 4] = d[k + 4] * drag - g * dt;
          d[k] += d[k + 3] * dt;
          d[k + 1] += d[k + 4] * dt;
          d[k + 2] += d[k + 5] * dt;
          if (d[k + 1] <= S.floor && d[k + 4] < 0) {
            d[k + 1] = S.floor;
            d[k + 12] = LIE;
            d[k + 6] = 0;
            d[k + 7] = d[k + 11];
          } else if (d[k + 6] >= d[k + 7] + S.lie[1]) {
            continue; // (lost in the air: gone)
          }
        } else if (d[k + 6] >= d[k + 7]) continue; // (lain its while: gone)
      }
      if (w !== i) {
        d.copyWithin(w * PF, k, k + PF);
        k = w * PF;
      }
      w++;
      // colour: fresh green to straw; lying it dims and fades out
      const t = d[k + 9], c = this._c, lying = d[k + 12] === LIE;
      c[0] = S.fresh[0] + (S.straw[0] - S.fresh[0]) * t;
      c[1] = S.fresh[1] + (S.straw[1] - S.fresh[1]) * t;
      c[2] = S.fresh[2] + (S.straw[2] - S.fresh[2]) * t;
      let a = d[k + 13];
      if (lying) {
        const u = d[k + 6] / Math.max(0.01, d[k + 7]);
        a *= S.lieAlpha * (1 - u * u);
      } else a *= Math.min(1, d[k + 6] * 25); // (fades in over 0.04 s: nothing pops)
      b.put(d[k], d[k + 1], d[k + 2], 0, d[k + 8], 0, c, a);
    }
    this.n = w;
    b.end();
  }
}
