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
  // Blast Dance: the point-blank blast (a palm in reach is a palm; out of reach a blast) and the hip shot
  dance: { speed: 18, size: 1 },
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
  // Heaven's Volley: he rises `rise` m; `count` strikes called `gap` s apart, each `warn` s, r `radius`,
  // led `lead` s onto where the hero is heading and scattered `scatter` m; then the dive (MOVES.md)
  volley: { rise: 4, count: 6, gap: 0.42, warn: 0.95, radius: 2.2, damage: 22, knockback: 3, lead: 0.5, scatter: 2.2 },
  // Storm Cage: `count` orbs on a ring of `r` m round the hero, open over `open` rad on the side away
  // from him; each hangs, the first `first` s, then one every `gap` s flies in at `speed` m/s
  cage: { count: 8, r: 5, open: 1.1, first: 0.7, gap: 0.4, speed: 12, radius: 1.3, damage: 20, knockback: 3, size: 1.1 },
  // Thunderfall (form `form` on): a strike called near where the hero is heading every `gap` s ([bar
  // full, bar empty]) in his moves' pauses, `maxLive` at most, `warn` s each (r `radius`); `start` s
  // into the form before the first; never in the hero's opening (the Lord's weather, spells.js)
  weather: { form: 3, start: 3, gap: [3.2, 1.8], warn: 1.1, slack: 0.9, retry: 0.4, radius: 2.1, lead: 0.55, scatter: 1.4, maxLive: 2, damage: 22, knockback: 3, inString: 0.1 },
  // ascend3: four bolts on the ring's corners `gap` s apart; a hero within `r` m of one is struck there
  // (a called strike with its ring and its cue, `warn` s)
  corners: { gap: 0.12, r: 2.4, warn: 1.1, damage: 22, knockback: 3 },
  // what his energy does to the world (fx.js reads T.world.blast / bigBlast / disc first; these are
  // the shots' own: the volley's dive, a corner bolt)
  world: { dive: 1.6, corner: 1.2 },
};
