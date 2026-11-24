// What hangs answers the wind (world/hang.js; the prop art material's PA_HANG, render/materials.js):
// banners, paper charm strips, a rope with its block. The motion is the living world's wind (uWind,
// uWindFronts: world/life/wind.js), so it is still while the wind piece is off and in the Windless
// Grove, and a front that crosses the grass reaches a banner at the same moment.
//
//   kinds    how a kind of hanging thing gives to the air, baked per vertex at build time (aHang.y):
//            `give` x the air's speed is the drag that swings it; a NEGATIVE give swings it as one
//            piece on its line (a rope and its weight: no ripple)
//   shader   the material's numbers (uHang, uHang2):
//            lean     the largest lean from the vertical (rad) a strong air gives
//            half     the drag (m/s x give) that gives half of `lean` (it grows with the square of the
//                     drag: half of `half` gives a fifth)
//            ripple   m of crosswise ripple at the free edge in a strong air (cloth, paper)
//            rate     the ripple's speed (rad/s at give 1; paper, lighter, runs faster: x sqrt(give))
//            along    the ripple's wave number downwind (rad/m): it travels with the air across the cloth
//            down     ... and down the drop (rad/m)
//            front    m/s of air a strength-1 front adds where it passes (the wind's own `air`)
//            wobble   0..1: the lean is never held: it breathes this share on two slow sines per piece
//   kick     a blow's shock (the living world's tremor, life/tremor.js → hangKick): a swing away from
//            the blow on top of the wind's lean, ringing down (uHangKick, uHangKickP):
//            slots    kicks at once (the newest replaces the weakest)
//            reach    m: it reaches this far from the blow, falling off as (1 - d / reach)^2
//            decay    1/s: how fast the swing rings down (e^-decay t: a tenth of it after ~1.4 s)
//            rate     rad/s of the swing (its period ~0.85 s: a banner on its bar)
//            speed    m/s the shock runs out from the blow (a far banner swings a beat later)
//            life     s after which a kick is spent (the shader skips it)
//            paper    how much more a paper strip swings (x sqrt(give), at most this)
export const HANG = Object.freeze({
  kinds: Object.freeze({
    cloth: Object.freeze({ give: 1 }),
    paper: Object.freeze({ give: 2 }),
    rope: Object.freeze({ give: -0.35 }),
  }),
  shader: Object.freeze({ lean: 0.5, half: 2.2, ripple: 0.07, rate: 6, along: 4, down: 2.2, front: 2.4, wobble: 0.22 }),
  kick: Object.freeze({ slots: 2, reach: 22, decay: 1.7, rate: 7.4, speed: 40, life: 2.6, paper: 1.35 }),
});
