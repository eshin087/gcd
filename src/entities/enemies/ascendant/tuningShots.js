// Tian Lei's numbers, the thrown and the called (d.T.shots; tuning.js spreads this in). THE SHOTS AGENT'S FILE.
// Timings, damage, speeds, radii, counts and world powers of that agent's moves live here, not in logic
// (MOVES.md rows: Spirit Shot, Scatter, Blast Dance, Golden Rain, Sun Wheel, Heaven's Volley, Thunder
// Gates, Lightning Lance, Storm Cage, Thunderfall; and ascend3's four corner bolts). Times in seconds,
// distances in metres. Starting values: the tuning pass moves them.
export const SHOTS_TUNING = {
  // a blast (fx.js 'blast'): `y` the height it flies at, `from` m ahead of his root it leaves (the palm)
  blast: { y: 1.15, radius: 0.5, life: 2.5, range: 22, size: 1 },
  // Spirit Shot: a returnable blast at 24 m/s; a perfect parry flies it back into him
  spirit: { speed: 24, size: 1.4, radius: 0.6, returnDamage: 50, returnPosture: 34 },
  // Scatter: three blasts in a fan of 28 degrees at 15 m/s
  scatter: { count: 3, spread: 0.49, speed: 15, size: 1 },
  // Blast Dance: the point-blank blast and the hip shot are palms when the hero is in reach (a line of
  // reach + 0.4 m); out of it, blasts slow enough to be cued from 3 m (a blast that could only be cued
  // under 0.2 s before contact fizzles: fx.js)
  dance: { speed: 9, hip: 12, size: 1 },
  // Golden Rain: ten small blasts in `dur` s, two fans sweeping `sweep` rad each side of the hero (left
  // to right, then back), `speed` m/s; each one waits (`hold` s at most) or is skipped if it would land
  // in another cue's window needing the other answer
  rain: { count: 10, dur: 1.6, sweep: 0.42, speed: 13, size: 0.8, damage: 9, hold: 0.12 },
  // Sun Wheel: the disc out `range` m on a curve (`curve` rad/s, its side drawn as it leaves), it hangs
  // `hang` s at the turn, home through where the hero stood at `back` m/s; `homeWait` the fairness
  // guard's longest extra hang
  disc: { speed: 16, back: 18, range: 12, curve: 0.85, hang: 0.3, radius: 0.7, homeWait: 0.4 },
  // a bolt (a line zone from his pointing fingers): its reach and width; a perfect parry throws it back
  bolt: { range: 17, width: 1.7, returnDamage: 50, returnPosture: 34 },
  // the cap on perfect returns (bolts and Spirit Shots alike): the first in full, each one within
  // `window` s of the one before x `decay` (Lightning Lance's four: 50 + 25 + 13 + 6 = 94, was 200)
  returns: { decay: 0.5, window: 3 },
  // Heaven's Volley: he rises `rise` m; `count` strikes called `gap` s apart, each `warn` s, r `radius`,
  // led `lead` s onto where the hero is heading and scattered `scatter` m; then the dive (MOVES.md)
  volley: { rise: 4, count: 6, gap: 0.42, warn: 0.95, radius: 2.2, damage: 22, knockback: 3, lead: 0.5, scatter: 2.2 },
  // Storm Cage: `count` orbs on a ring of `r` m round the hero, open over `open` rad on the side away
  // from him; each hangs, the first `first` s, then one every `gap` s flies in at `speed` m/s
  cage: { count: 8, r: 5, open: 1.1, first: 0.7, gap: 0.4, speed: 12, radius: 1.3, damage: 20, knockback: 3, size: 1.5 },
  // Thunderfall (form `form` on): a strike called near where the hero is heading every `gap` s ([bar
  // full, bar empty]) in his moves' pauses, `maxLive` at most, `warn` s each (r `radius`); `start` s
  // into the form before the first; never in the hero's opening (the Lord's weather, spells.js)
  weather: { form: 3, start: 3, gap: [3.2, 1.8], warn: 1.1, slack: 0.9, retry: 0.4, radius: 2.1, lead: 0.55, scatter: 1.4, maxLive: 2, damage: 22, knockback: 3, inString: 0.1,
    // (the tuning pass: a strike may land up to `past` s after the end of the move it is called in (the
    // next move's blows hold for it); a mark not yet cued fades if he is thrown into a reaction)
    past: 0.3, fadeInOpening: true },
  // ascend3: four bolts on the ring's corners `gap` s apart; a hero within `r` m of one is struck there
  // (a called strike with its ring and its cue, `warn` s)
  corners: { gap: 0.12, r: 2.4, warn: 1.1, damage: 22, knockback: 3 },
  // what his energy does to the world (fx.js reads T.world.blast / bigBlast / disc first; these are
  // the shots' own: the volley's dive, a corner bolt)
  world: { dive: 1.6, corner: 1.2 },

  // ---- the third wave (BRIEF3 "ki")
  // Heaven's Lantern (forms 2 - 3): he rises `lift` m and gathers the great orb over his hands through
  // the `windup` (fixed); at the impact it is thrown at where the hero will be `lead` s on (no homing),
  // `speed` m/s, flying from `y` m down to `yTo` at the hero (on down to the floor past him), `radius`
  // m (its hit), drawn `size`; it flies `range` m at most. It hits for the beat's damage (blue: a parry
  // or a block is safe; a roll passes it). `dim` the ring's light at the gather's height. `rise` /
  // `drop` the fractions of the windup he rises through, `recovery` s he drops to the floor in.
  // THE PUSH (a PERFECT parry): a lock at range (start / push / decay / dur / hold as the beam's
  // clash); won = it flies back into him (`returnSpeed`) for `returnDamage` / `returnPosture` and he
  // reels `reel` s; lost = `lose` on the hero (knockdown, thrown). `margin` m the camera keeps round
  // the pair. World: `world` power, craters of `crater` m (on the guard / the hero: `guardCrater`).
  lantern: {
    windup: 1.8, lift: 2.5, recovery: 0.8, damage: 26, knockback: 6,
    speed: 10, size: 4.5, radius: 2.0, y: 3.6, yTo: 1.3, range: 30, lead: 0.3, dim: 0.35,
    push: { start: 0.5, push: 0.085, decay: 0.3, dur: 2.6, hold: 0.55 },
    returnSpeed: 14, returnDamage: 120, returnPosture: 220, reel: 3.0, lose: { damage: 40, knockback: 10 }, margin: 3.5,
    world: 2.2, crater: 4, guardCrater: 3,
  },
  // Raining Suns (forms 2 - 3): he leaps `lift` m and hangs; `count` small blasts poured down in `dur`
  // s from his palms (alternating), each aimed at where the hero is at its throw + `lead` s of his
  // way, scattered `scatter` m, `speed` m/s, falling to `yTo` m at the hero (on to the floor past
  // him); each waits `hold` s at most for a clear landing (the fairness guard) or is skipped. Only every
  // `direct`-th is on him: the others land `side` m off to his sides (across the line), pocking the
  // floor round him (a guard held through the whole pour and the finisher is not worn through:
  // GUARD.costMin 8 a block, 100 in all). Then the finisher: a returnable blast (`fin`) thrown down
  // from the air.
  barrage: {
    count: 16, dur: 2.2, lift: 3, speed: 17, size: 0.7, damage: 8, lead: 0.15, scatter: 0.4, yTo: 1.1, hold: 0.12, direct: 3, side: [1.7, 2.6],
    fin: { speed: 20, size: 1.6, radius: 0.6, damage: 22 },
  },
};
