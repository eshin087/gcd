// Bullet-hell tuning (docs/COMBAT.md "Bullets"): the small projectiles and the ground tongues of
// bullets.js and the breathed patterns of bulletAttacks.js. Registered into TUNING (tuning.js):
// TUNING.bullets = BULLETS, Object.assign(TUNING.attacks, BULLET_ATTACKS), so the Lab, abilities() and
// hitPlayer read the patterns like every other attack.
//
// Units: seconds (phase-1 values; windups and recoveries x d.tScale in later phases, the bullets
// keep their speed), WORLD metres (bullets are sized against the 1.8 m hero), HP, radians.
// Per-phase values are [P1, P2, P3]. `weight` = AI weight per phase (0 = never picked there).
//
// The rule of the bullets: EMBERS (orange, normal tell) can be parried one by one (each deflect
// sends the bullet back at the wyrm's head and adds `posture`), blocked for chip, rolled through or
// cut out of the air with a swing; ORBS (red) and the TONGUES of fire on the ground (red) are
// dodge-only like every red attack. Bullet damage is NOT scaled by TUNING.damageScale: these are the
// final numbers. Every bullet is BREATHED (ADR-050): it leaves rig.pt.mouth along the head's aim, so
// the pattern shapes are what a head can make (a swept stream, coughed cones, embers coughed high
// that rain down, a breath driven along the ground). Nothing homes (2026-11-15: the blue wisp swarm
// was removed). The wyrm never turns its body faster than its walking turn rate while it breathes:
// the neck and the head do the aiming (2026-11-15: no more pirouette, no more turntable sweep).

import { TELL } from '../../combat/rules.js';

export const BULLETS = {
  // posture: a parry's deflect; returnDamage / returnPosture: a PERFECT parry's return (ADR-051): HP
  // damage to the wyrm when the shot lands (an ember about one light hit) and the posture it adds
  // instead of `posture`
  ember: { tell: TELL.NORMAL, r: 0.32, damage: 8, burn: 0, knockback: 0, posture: 5, returnDamage: 30, returnPosture: 14 },
  orb: { tell: TELL.RED, r: 0.62, damage: 20, burn: 1.5, knockback: 3 },
  height: 1.0, // flight height (m): chest height of the hero
  arm: 0.05, // a bullet cannot hit in its first `arm` s
  grace: 0.45, // after a bullet HIT every touching bullet fizzles for this long (no chain melts)
  pop: 1.5, // a deflect also bursts the small bullets within this many metres of the hero ...
  cut: 0.45, // ... and a sword swing cuts the small bullets within this of the blade
  // every bullet that will hit announces itself with a glint + combat:tell / combat:flash flashLead s
  // before impact; impacts within cueGap s of an announced one ride on that cue (one parry answers
  // them all), a bullet that could only be announced later than cueMin s before impact fizzles when
  // it is younger than `young` s (spawned point-blank), else it hits (the hero ran into it)
  cueGap: 0.3, cueMin: 0.24, young: 0.6,
  // an impact within clashSep s of an announced one of the other answer (ember vs orb) is a dud, no
  // cue (integration, 2026-11-15: the Ember torrent's in-flight embers reached the hero 0.08 s after
  // its coughed orbs, red and white cued 0.07 s apart)
  clashSep: 0.35,
  ricochet: 24, // a deflected bullet's speed back to the wyrm's head (m/s)
  returnSpeed: 34, // a perfectly parried bullet's speed back to the head (m/s; drawn x returnSize)
  returnSize: 1.8,
  // HP one pattern's returns may deal in all (~8 % of a phase's 1500 HP: 4 embers); past it a perfect
  // parry is a plain deflect
  returnBudget: 120,
  bound: 33, // bullets die silently this far from the wyrm
  // a breathed bullet leaves at mouth height and reaches `height` after drop = clamp(dropK x the
  // mouth-to-hero distance / speed, dropMin, dropMax) s: a close hero is not flown over
  dropK: 0.55, dropMin: 0.12, dropMax: 0.8,
  // a lobbed ember (Ember rain) falls under this gravity (m/s^2) and bursts where it lands
  lobG: 22,
  // ground tongues (the Scouring breath, Fire lanes): after a tongue hits, the field's tongues
  // cannot hit again for `cd` s (`cdDodge` after a roll through one, `cdOther` otherwise); a tongue
  // only hurts a hero it announced (combat:flash) within `cueHold` s
  tongue: { cd: 1.0, cdDodge: 0.5, cdOther: 0.3, cueHold: 0.75, cueMin: 0.27 },
  // what the fire does to the world (ADR-107): a landing ember's blow on the pieces it lands on, the
  // tongues setting what they crawl over alight (x FIRE.life)
  // (tuning, 2026-11-15: land 0.25: every ember that landed chipped what it fell on, and a phase of
  // torrents broke the whole paving; 0.08 is under BREAK.scratch: it marks and sets alight, no more)
  world: { land: 0.08, landFire: 0.5, tongueFire: 1 },
};

export const BULLET_ATTACKS = {
  // EMBER TORRENT: plants its feet, lowers the head and sweeps it side to side across the hero's
  // bearing (the neck does it; the body only re-centres at a walking turn), breathing a living stream
  // of embers: it comes in gusts (clumps, gaps), a hotter core, embers peeling off. The curtain
  // crosses the hero once per half-sweep (parry the crossing, or walk with the wave). P2+: at each
  // sweep extreme the head snaps round and coughs a tight fan of red orbs at him (roll). P2+ the
  // torrent ends in BARKS: the neck stops, the head snaps onto him and barks short dense cones,
  // `barkGap` apart (parry each; P3's last bark is red orbs: roll)
  emberStorm: {
    label: 'Ember torrent (sweeping breath)', tell: TELL.NORMAL, phase: 1,
    windup: 1.1, cast: [3.6, 4.2, 4.8], recovery: 1.0,
    arc: [0.75, 0.85, 0.95], // rad either side of the (slowly re-centred) hero bearing
    sweepHz: [0.32, 0.37, 0.42], recentre: 0.6, // sweeps / s; the centre follows the hero at rad/s
    every: 0.06, speed: 9, life: 3.4, // one ember per lane every `every` s
    speedJit: 0.1, aimJit: 0.035, // share of speed / rad of aim each ember strays by (the stream's body)
    gustHz: 1.7, gustGap: 0.24, // gusts / s; the share of each gust with no embers (the gaps)
    lanes: [1, 2, 3], laneGap: 0.22, // the stream split into a forked tongue (rad between lanes)
    orbs: [0, 3, 4], orbSpread: 0.18, orbSpeed: 6.5, cough: 0.3, // P2+: red orbs coughed at each extreme
    // no ember of the stream reaches the hero within orbSep s of the orbs (red, a roll) reaching him: a
    // gap opens in the stream there (integration, 2026-11-15: the orbs are slower; the sweep coming back
    // across him put white embers on him within 0.3 s of them several times a cast at 12 - 26 m)
    orbSep: 0.4,
    barks: [0, 2, 3], barkGap: 0.42, barkCount: [7, 7, 9], barkSpread: 0.3, barkSpeed: 11, // the closing barks
    barkOrbs: [0, 0, 5], // P3: the last bark is this many red orbs instead
    reach: 2.5, dy: -0.55, // the head's reach out of the neck base (model units) and its dip
    maxHits: 6, // a torrent cannot hit more often than this
    maxDist: 26,
    weight: [0.5, 2.0, 2.8], cooldown: 10, // (tuning: [1.6, 2.0, 2.0]; P1's one lane: a cue in 2 s, gaps of 3 s)
  },
  // CINDER BURST: the head snaps onto the hero and coughs shotgun cones, every bullet from the jaws.
  // Even coughs put an ember dead on him, odd ones put him in a gap (weave or deflect); P2+ the last
  // cough is a red orb wave (roll); P3 every other cough is a double tap (a second cone 0.14 s later,
  // half a spacing over: one parry's shield answers both)
  fanVolley: {
    label: 'Cinder burst (coughed cones)', tell: TELL.NORMAL, phase: 1,
    windup: 1.0, gap: 0.55, recovery: 0.9,
    volleys: [4, 6, 7], count: [9, 11, 13], spread: 0.55, // half-angle (rad)
    speed: 10.5, life: 3.2,
    orbWave: [0, 6, 7], orbSpread: 0.5, orbSpeed: 8,
    doubleTap: [0, 0, 1], tapGap: 0.14,
    chain: [0, 0, 0.35], // P3: chance the burst runs straight into an Ember torrent (brain.queued)
    recoil: 0.3, // m the head kicks up per cough
    maxHits: 5,
    minDist: 5, maxDist: 30,
    weight: [2.4, 2.8, 3.2], cooldown: 6.5, // (tuning: [2.4, 2.8, 2.8])
  },
  // CINDER SPIT: a quick snap between other moves: the head flicks onto the hero and spits two or
  // three fast embers, one dead on him (parry / block / roll). Short enough to be chained between
  // melee strings (other moves' `links` point at this key).
  cinderSpit: {
    label: 'Cinder spit (quick snap)', tell: TELL.NORMAL, phase: 1,
    windup: 0.36, cast: 0.14, recovery: 0.22, // 0.72 s in all in phase 1
    count: [2, 3, 3], spread: 0.09, speed: 15, life: 2.6, // embers per spit, rad between them
    twice: [0, 0, 1], twiceGap: 0.12, // P3: a second spit, half a spacing over (one parry answers both)
    arcMax: 1.1, // rad off its facing the hero may stand (a snap of the neck, not a turn)
    maxHits: 1,
    minDist: 3.5, maxDist: 28,
    weight: [1.6, 1.6, 1.8], cooldown: 3.2, // (tuning: [1.0, 1.4, 1.6])
  },
  // EMBER RAIN: rears up and coughs volleys of embers high into the air; they arc over and rain down
  // round the hero: one on the spot he stood on, the rest in a ring round it (turned each volley), the
  // spots glowing as they fall. Keep moving (they land where he WAS), or parry the one that falls on
  // him (normal tell; block for chip).
  emberRain: {
    label: 'Ember rain (coughed skyward)', tell: TELL.NORMAL, phase: 2,
    windup: 0.9, gap: [0.6, 0.55, 0.5], recovery: 0.8,
    volleys: [3, 3, 4], ring: [6, 6, 8], ringR: 2.6, ring2: [0, 0, 6], ring2R: 4.8, // embers per ring, ring radii (m)
    flight: [1.1, 1.1, 0.95], // s from the jaws to the ground
    lead: [0, 0, 0.35], // P3: the centre ember lands this many s ahead along his run (m/s x s)
    life: 3,
    maxHits: 3,
    minDist: 6, maxDist: 24,
    weight: [0, 1.6, 2.2], cooldown: 9, // (tuning: [0, 1.6, 1.8])
  },
  // SCOURING BREATH: braced on all fours, it rakes a sustained breath across the ground: the neck
  // sweeps the head through an arc of `arc` rad (about 90 degrees) across the hero's bearing, with a
  // clear start, a held stop (`pause`) and a rake back. Where the breath strikes the ground it drives
  // TONGUES of fire out along it (`tongues` lines per rake, each crawling out at `speed` m/s and burning
  // `hold` s behind its front, then dying into glowing ground). The body stays braced: it never turns
  // faster than its walking turn rate. P3 rakes three times, and from P2 the rake back lays its
  // tongues in the gaps of the first (`interleave`). Roll through a tongue, or stand between two.
  fireWheel: {
    label: 'Scouring breath (raking ground fire)', tell: TELL.RED, phase: 2,
    windup: 1.3, recovery: 1.1,
    rakes: [2, 2, 3], arc: 1.6, rakeTime: [1.5, 1.45, 1.3], pause: 0.35, // rad in all; s per rake; the stop
    // tongues per rake, evenly over the arc (odd: the middle one runs over the hero); the rake back's
    // shift into the gaps (x a step). P2 7 (0.27 rad apart, ~3 m at 12 m: room to stand between two
    // until the rake back fills them), P3 9 (0.2 rad: with the rake back, a solid field to roll through)
    tongues: [7, 7, 9], interleave: [0.5, 0.5, 0.5],
    speed: 13, hold: [1.5, 1.5, 1.8], r1: 26, width: 1.2, // m/s the fronts crawl; s each spot burns; reach, width (m)
    reach: 2.3, dy: -0.5, strike: 2.0, // the head's reach / dip (model units); the strike point (m ahead of the jaws)
    damage: 20, burn: 1.5, knockback: 4,
    maxHits: 3,
    minDist: 9, maxDist: 24, // (closer than ~7 m to the neck base he stands under the breath: no tongue starts there)
    weight: [0, 0.7, 0.6], cooldown: 14, // (tuning: [0, 1.2, 1.5]: one cue in 6 - 8 s)
  },
  // FIRE LANES (P3): the head drives the breath into the ground at its feet, again and again, and
  // each strike splits into LANES of fire that crawl out across the field (`lanes` wedges round the
  // hero's bearing, each `band` tongues wide). Every strike lights a different set (the pattern
  // below), so the safe lane moves: step into the dark lane before the fire reaches you, or roll
  // through it (red).
  fireLanes: {
    label: 'Fire lanes (alternating ground fire)', tell: TELL.RED, phase: 3,
    windup: 1.0, recovery: 1.0,
    // wedges; rad between them; tongues per wedge, rad apart (band x bandGap = laneGap: a lit wedge
    // is a band of fire, its lines 1.1 - 1.7 m apart at 15 - 22 m, each 1.2 m wide; a dark one has a
    // ~3 m stripe to stand in at 12 m)
    lanes: 5, laneGap: 0.3, band: 4, bandGap: 0.075,
    // lit lanes per strike (bit i = lane i, 0 the leftmost): outer + middle, the two between, ...
    pattern: [0b10101, 0b01010, 0b10001, 0b01110], strikes: [3, 3, 4], strikeGap: [0.95, 0.95, 0.85],
    speed: 12, hold: 0.85, r1: 24, width: 1.2, // (hold < strikeGap: one strike's lanes die down as the next ones come)
    reach: 2.0, dy: -0.8, strike: 2.0,
    damage: 18, burn: 1.2, knockback: 3,
    maxHits: 2,
    minDist: 8, maxDist: 22,
    weight: [0, 0, 0.8], cooldown: 13, // (tuning: [0, 0, 1.4]: a hero in a dark lane meets one cue)
  },
};
