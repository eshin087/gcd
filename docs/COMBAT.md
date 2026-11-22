# Combat design

ABYSS is an action RPG, not a stamina-gated soulslike. Fights are about **reading tells** and
answering them with **block, parry or a perfectly timed dodge** — inspired by Phantom Blade Zero's
attack tells, read from the enemy itself rather than from HUD text, and by Sekiro's deflect
exchanges: an enemy's combo is met blow by blow. Numbers live in `src/combat/rules.js` (shared) and
each actor's `tuning`.

## Core rules
1. **No stamina.** Attacking, rolling, sprinting and blocking are free; pacing comes from attack
   recovery, roll recovery and the enemy's patterns. Blows met on a held guard wear the **guard
   meter** (*The guard meter*, below): nothing the hero does spends it, and it refills by itself.
2. **Every enemy attack has a tell** declared in its data: `normal`, `blue`, `red` or `black`
   (`TELL` in `rules.js`); every hit of a combo string has its own. Tells are **read from the
   attacker, never from HUD text or icons** (no PARRY / DODGE labels, no marks or rings over the
   enemy, no off-screen arrows). Every hit has a **timing cue ~0.35 s before impact**
   (`combat:flash`): a white glint for an ordinary blow, **the flare** for a moment (ADR-118: red =
   dodge, blue = parry, black = dodge a charged blow). Windups are long enough to react to (≥ 0.7 s
   in phase 1 for melee, the first hit of a string included; a string's next hit lands ≥ 0.45 s
   after the previous one). How each tell looks: see *Tell presentation* below; the moments: *The
   flare, the counter and the charged blow*.
3. **Answers**
   | Tell | Block (hold RMB) | Parry (tap RMB just before impact) | Dodge (Space) |
   |---|---|---|---|
   | `normal` — white glint | no damage, costs guard (damage × 1), small pushback | full negate, posture dmg; a string goes on | i-frames; perfect → a streak pip and slow-mo where you stand |
   | `blue` — big white glint (heavy blow) | no damage, costs guard (damage × 1.5), big pushback | full negate, **big** posture dmg; a string goes on | i-frames; perfect → a streak pip and slow-mo where you stand |
   | `blue` + `flare` — **the blue flare** (a parry moment) | as `blue` | full negate, big posture, his string **ends**, and the hero **counters by himself** | as `blue` |
   | `red` — **the red flare** | **fails** (full dmg, knockdown) | **fails** | **only answer**; perfect → the flurry / the plunge (a fire hazard: in place) |
   | `black` — darkness gathers through a long windup, then **the black flare** | stopped, no damage, but **the whole guard meter is gone** and the guard is knocked open (0.8 s) | the same as a block | **only clean answer**; perfect → the flurry / the plunge |

   A blocked contact stream (the fire breath's ticks, burning ground, a bullet) is no blow: it
   chips HP as before (−80 % / −50 %) and costs no guard.
   Attacks may override parry/block (a fire stream is blockable but not parryable). "Perfect →
   plunge" needs an attacker with a head to stab (the wyrm) within range; otherwise a perfect dodge
   gives the slow-mo and the crit window where you dodged (rule 5).
4. **Parry** = RMB pressed ≤ `parryWindow` (0.22 s) before impact, attacker within the front arc.
   Pressed ≤ `perfectParryWindow` (0.08 s) before impact it is a **perfect parry**
   (`player:parry.perfect`): a perfectly parried bullet comes back as a damaging shot (ADR-051,
   *Bullets* below); a perfectly parried blow of the body or the blade deals × 1.5 posture and readies
   the **counter cut** (the first light started within 0.9 s winds up twice as fast and crits; ADR-102).
   Mashing is prevented: RMB must be released `parryRearm` (0.25 s) before a new press counts —
   **except right after a successful parry**: a deflect re-arms at once, so the next press counts as
   soon as RMB was released, even when the guard was held between blows (ADR-032). A press that
   parries nothing needs the full re-arm again, so mashing still fails. Holding RMB after the press
   keeps blocking; between parries in rhythm the guard stays up (~0.3–0.6 s).
5. **Perfect dodge** = a dodge started ≤ `perfectDodgeWindow` (0.2 s) before impact. Perfect
   dodges in a row are a **streak**. A perfect dodge of a **white or heavy blow** (one a parry
   answers) counts in the streak and slows time (×0.3 for 0.6 s) where you stand: no flurry, no
   plunge, no crit window, and his string goes on (ADR-102, *The reward order* below). A perfect dodge
   of a **red** blow is answered with as many blows as the streak counts (*The streak and the
   flurry*, below):
   - against the wyrm, with its head within `DEFENSE.plunge.range` (30 m) → **the flurry** round its
     head; the first of a streak is one blow, an art, and one of the arts is **the plunge** (below):
     you appear above its head and drive the blade in (ADR-027);
   - out of range, or against a hit that forbids it (`plunge: false`: the fire spells' hazards —
     meteors, pillars, rings, walls; fire breathed or spat from the air, the burning pass's stream
     and the hover barrage's shells, does allow it: the hero lands on the flying wyrm, which crashes) →
     **slow-mo + crits in place**: time slows (×0.3 for 0.6 s) and for 1.6 s your hits crit (×1.8),
     with no teleport;
   - against a foe with a body to cut and no head to plunge into (a duelist, within 12 m) → **the
     flurry** on the ground: it ends behind his back, the crit window open;
   - against anything else → the v0.2 **Ghostep**: a blink 3.2 m behind it (within 12 m), the same
     slow-mo and crits. The blink behind the wyrm is retired: players lost sight of themselves
     behind it.

   A dodge outside the window is a normal i-frame dodge. A dodge with no direction held is a
   **backstep** (shorter i-frames 0.03–0.22 s). Streams (fire breath) only count as a perfect dodge
   when the roll starts into them; rolling out of one is a plain dodge.
6. **Posture.** Enemies have a posture meter (gold bar under the boss HP). Parries fill it most (26 /
   48 per normal / blue parry, against 5 / 16 per light / heavy weapon hit; the plunge adds 40); at
   max the enemy is **broken** for 3.2 s (open: ×2.2 crits). It recovers after 3 s without posture
   damage. **Execution:** while the wyrm is broken, attack with its head within 9 m → the plunge as
   an execution (260 damage, no slow-mo); it spends the break.
7. **Phases and gates.** The wyrm has three phases: P1 100–66 %, P2 66–33 %, P3 33–0 % of its HP.
   While the AI runs the fight, damage stops at the next phase's threshold until its transition
   starts, so burst crits can't skip a phase (damage numbers still show). Each transition is a
   scripted roar (a red shock ring) that clears every fire hazard; the new phase's abilities then
   come in one by one, and phase 3 opens with the Inferno nova (ADR-028).
8. **Strings and the deflect chain.** A string is one attack of several hits. Parrying a hit that is
   not the string's last **deflects** it: its posture damage applies, the struck paw or head is
   knocked back (visual only), and the next hit comes on schedule. Parrying the **last** hit (or a
   single melee attack) recoils the wyrm: the punish window. A red hit inside a string must be
   dodged; a perfect dodge of it plunges and ends the string (ADR-026).
9. **Hazards** are world threats that live on their own (meteors, lava pillars and their pools,
   burning strips, fire rings and walls, the ambient cinders), so the wyrm can keep fighting while they burn. Each heats the ground it will hit
   from spawn to impact (ADR-052: a glow of small ground glyphs and scorch heat, darker to brighter
   as it nears; the exact edge in the last 0.35 s). They are red: block and parry fail, i-frames or leaving the area avoid them,
   and a perfect dodge of one never plunges (slow-mo + crits in place). A burning strip's lingering
   fire deals small blockable contact ticks, never while you roll (ADR-029).
10. **Fairness checklist for every new attack:** tell type set (per hit for strings) · windup
    ≥ 0.7 s (melee; a string's first hit) and readable from the animation alone (parryable hits get
    no colour before the glint) · flash ~0.35 s before impact · string follow-ups ≥ 0.45 s apart ·
    hitbox matches the visual · recovery window to punish · no unavoidable damage (AoE red attacks
    and hazards heat the ground they will hit until impact, the edge drawn in the last flashLead s;
    every hazard can be dodged with i-frames or by moving) · every projectile has a visible source
    (bullets leave the jaws, ADR-050) · **two cues that need different answers never land within
    0.3 s of each other** (ADR-119, enforced in code, not left to luck: across sources the wyrm holds
    a melee blow's windup up to 0.5 s for a blast or a bullet of the other answer
    (`TUNING.pressure.guard`), a spell or bullet pattern does not start on top of another's, a move
    that asks for a guard waits while meteors or a chase fall and one that asks for a dodge while
    bullets fly; inside one pattern an ember that would land beside an orb fizzles instead
    (`TUNING.bullets.clashSep` 0.35 s, the torrent's `orbSep` 0.4 s); the duelists' engine does the
    same with its fairness guard: *The duelists' pressure and the fairness guard*). The one exception
    to "what lands away from the boss marks its ground": **a thrown piece of the terrain shows no
    landing mark** (the owner's choice: the wyrm's, ADR-119; the duelists' kicked and hurled pieces,
    ADR-122): the flare on the flying piece is its cue, and a roll at it always dodges. What topples
    (a cut pillar, a wrenched shard) and what is called down from the sky keep their ground mark.

## The reward order (2026-11-15, ADR-102)
The riskier the answer, the more it pays. From safest to riskiest:

| Answer | Works on | What it pays |
|---|---|---|
| Block (hold) | white, heavy | nothing; costs guard |
| Dodge | everything | nothing |
| Perfect dodge | white, heavy | a streak pip, slow-mo where you stand; the string goes on |
| Parry | white, heavy | posture (26 / 48), guard back, a streak pip; the last blow: his recoil and the riposte |
| Parry | a blue flare blow (a parry moment) | the same, wherever in his string it came: his string ends, and the counter: the streak's flash cuts, the last one the counter blow (64 damage, 30 posture) |
| Perfect dodge | red, black | the flurry (the plunge on the wyrm): as many blows as the streak counts, the crit window |
| Perfect parry (≤ 0.08 s) | white, heavy | posture × 1.5, the counter cut; a blade lock on a `lock` blow; a bullet returned |
| Flash counter (attack ≤ ~0.14 s before his blow) | a blade's white or heavy blow | 70 damage and 60 posture at once, he reels, the crit window; too late and his blow lands |

So the streak is **built** on white blows (parries, perfect dodges, clashes) and **cashed** on a red
blow (the flurry) or a parried last blow (the riposte).

**Why (measured).** Until 2026-11-15 every perfect dodge was answered with the flurry. Three god-mode
bots that differ only in how they answer a tell (`node tests/integration/<suite>.mjs . strategy`):
*mixed* parries white and heavy blows and perfect-dodges red ones, *parry* does the same but rolls
red blows early (no perfect dodge), *dodge* perfect-dodges everything and never parries. Seconds to
win, before → after:

| Boss (seeds) | mixed | parry | dodge |
|---|---|---|---|
| Shen Hui (4242 / 7 / 99) | 33 / 39 / 35 → the same | 38 / 40 / 45 → the same | 27 / 32 / 31 → 75 / 84 / 95 |
| The Starless Lord (4242 / 7) | 57 / 63 → the same | 76 / 76 → 84 / 76 | 60 / 63 → 161 / 152 |
| The wyrm (4242 / 7; seed 7 not run before) | 104 / – → 104 / 90 | 149 / – → 154 / 138 | 68 / – → 124 / 81 |

Before, the bot that only dodged won fastest on every boss with a third of the inputs (8 – 12
perfect dodges against 26 – 32 parries on Shen Hui): nobody had to learn a string. Now it is the
slowest on both duelists and level with mixed play on the wyrm, whose red blows are many (the
*parry* bot forgoes their plunges by construction). With a 1.2 s crit window on a white perfect
dodge the dodge bot still beat the wyrm in 63 s on crits alone: that window is 0
(`DEFENSE.ghostep.critWindowWhite`). Bots answer a cue in one frame: a human playtest is still owed.
The old rule is one switch away: `DEFENSE.flurry.on: 'any'`, or `player.debug.flurryAny` in the console.

## The flare, the counter and the charged blow (2026-11-15, ADR-118)
Owner: "add more perfect parry / perfect dodge moments into the game from the bosses ... a red
flash to give you a tell/sign to dodge at that exact moment and if you do dodge it in time, it will do
a cool animation of the dodge/parry and do a counter attack ... a black charged up attack ... the
player needs to dodge it, if they block it they lose all guard". The owner's four answers: flash only;
the counters automatic for both; a black blow on the guard empties it and deals nothing; all three
bosses.

**A moment** is a blow cued by the flare (*Tell presentation*). Three kinds:

| Flare | Answer | In time | Wrong answer |
|---|---|---|---|
| **red** | dodge | a perfect dodge (the roll started ≤ 0.2 s before the blow): **the flurry** (the plunge on the wyrm), as before | a guard or a parry fails: full damage, knocked down |
| **blue** | parry | any parry (pressed ≤ 0.22 s before the blow): **the counter** | a held guard holds it but costs guard x 1.5; a hit is a hit |
| **black** | dodge | a perfect dodge: the flurry, as for red | a guard or a parry stops the blow and deals nothing, but **the whole guard meter is gone** and the guard is knocked open for 0.8 s, thrown back 2.4 m (`GUARD.black`): the next blow lands |

- **The counter** (`DEFENSE.flareCounter`, `player:flareCounter`). A blue blow marked `flare: true` in
  its data is a parry moment. A parry of it (not only a perfect one) beats the blow aside in a blue
  burst, **ends his string there** (he recoils as from a parried last blow, wherever in the string it
  came) and the hero answers by himself once the parry's freeze is over: the riposte's flash cuts, as
  many as the streak counts (7 at most), **the last one the counter blow: 64 damage (final) and 30
  posture**, a heavier freeze, COUNTER on the banner. He ends where he parried, free at once. Only
  when the target is in the riposte's range (the wyrm's head within 11 m, a duelist within 6 m). A
  perfect parry of a `lock` blow still crosses the blades first (the blade lock). A heavy blow that is
  not marked keeps the white star and the plain deflect.
- **The charged blow** is the one thing a held guard is wrong for: a defensive player loses nothing
  by blocking anything else (ADR-095), and here the charge is the warning, 1.5 s of it.
- **The moments each boss has** (`flare: true` on a blue beat / hit; `tell: black`):

  | Boss | Parry moments (blue flare) | Dodge moments (red flare; * = new) | The charged blow (black) |
  |---|---|---|---|
  | The Cinder Wyrm | Bite; Hesitant maw's held bite; Claw combo's lunging bite; Wing buffet's second wing; **Wing rend's lunging bite\***, **Sky hammer's wing slam\***, **Cinder rake's overhead\***, **Cataclysm's wing slam\***, **the Tail bat\*** (the boulder; ADR-119) | every red blow it had (tail, stomp, charge, pounce, leap, the fire flights); **the tail whips\*** (Pivot lash, Rear guard, Cinder rake, Cataclysm), **Rear guard's tail slam\***, **Furnace maw's wing slam\***, the flying combos' blows\*, the ground tongues\*, the ambient cinders\*, a thrown tree or boulder\* (ADR-119) | **Black maw**: the head rears and holds 1.5 s + 0.15 - 0.6 s, then the snap: 44, range 3.5 - 6.5 m off its chest, cooldown 14 s |
  | Shen Hui | Falling Ash; Falling Star; Swallow Flicks' thrust; Crane Spins' chop; Swallow's Return; **Severing Wind*** (one long step from 3.6 - 10 m and a level two-handed cut, 26) | Piercing Ash, Lotus Sweep, Ember Whirl's last, Heaven-Splitting Fall, Hundred Petals' last; **Twin Embers*** (a dashing cut, then the low sweep 0.92 s later: dodge, dodge; 22 and 24) | **Black Tide**: the jian drawn back low, 1.45 s + 0.1 - 0.5 s, then a dashing cleave up to 7.5 m: 38, knocked down, cooldown 12 s |
  | The Starless Lord | Falling Star; Scissor; Grasp and Sever's chop; **Severance*** (a long step and a two-handed chop, 26; every form) | his red blows and spells as before; **Red Meridian*** (a dashing level cut, then the blade round at the ankles; every form) | **Nightfall**: the same charge and cleave, 36; every form, cooldown 12 s |

- Checked by `npm test`: duel FLARE (the rules; nothing shows before a red cue; a parried Falling Ash
  is countered and a parried unmarked heavy is not; Black Tide on a held guard, on a parry press,
  unanswered, perfectly dodged), lord FLARE, integ FLARE (the bite's counter round the head, Black
  maw). **Not measured:** how the fights' length and difficulty moved (the bots of *The reward order*
  were not re-run), and how readable the flare is on a phone.

## The guard meter (2026-11-14, ADR-095)
The hero has a guard meter of 100 (`GUARD` in `rules.js`; a thin steel bar under his HP bar, and a
gauge along the foot of the touch BLOCK tile). It makes a held guard something to manage without
making defence a chore: it is not stamina.
- **A blocked blow costs guard, not HP:** its damage × 1 (normal) or × 1.5 (blue: the blow you
  should have parried), at least 8 and at most 60. While there is guard left a block takes no HP.
- **The blow that empties it is still blocked**, but it knocks the guard open: GUARD DOWN, a
  stagger of 0.55 s in the guard break's opening pose, with no damage and no knockdown. The next
  blow of a string lands in it. (A red blow met on the guard is still the full guard break with
  its knockdown: rule 3.)
- **It refills by itself:** 60 per second (empty to full in about 1.7 s), starting 0.8 s after the
  last blow he blocked or took (0.35 s after it was knocked open). Standing, moving, holding the
  guard up and swinging all refill it: only being struck pauses it.
- **Every parry gives guard back at once:** 28 (normal), 45 (blue), 10 for a deflected bullet, 20
  more for a perfect parry.
- **Every cut of his own that lands gives a little back:** 4 for a light hit, 10 for a heavy one.
- Contact streams and bullets leave it alone (they chip HP through a block as before). God mode
  spends none. Rest and respawn fill it.

So: holding the guard through one string is safe, holding it through two in a row without a parry
or a cut of your own gets it knocked open, and a parry or a hit between them resets the count.

## Tell presentation
```
       windup start (combat:tell)            timing cue (combat:flash), 0.35 s before impact
red    animation only                        THE RED FLARE through the striking part, a red light,
       audio: low brass sting                body spike 1.6 gone in 0.25 s, red screen-edge flash
blue   animation only (blade 'shing')        a white eight-point star 1.6x as big, with a ring
 +flare (a parry moment)                     THE BLUE FLARE instead, a blue light, blue screen edge
black  darkness gathers on the striking      THE BLACK FLARE (a dark bar round a white-hot thread),
       part (an eclipse that grows), the     the screen edge goes dark
       body darkens, the screen edge dims
normal animation only (faint audio tick)     a white cross on the letter grid + bright ting
hazard the ground heats up from its spawn     its edge shows, the heat flares, a warm light
       audio: a lighter hazard cue           no screen-edge flash
```
- **The flare (ADR-118; owner: "exactly like Phantom Blade Zero ... a red flash to give you a
  tell/sign to dodge at that exact moment").** The cue of a moment is one wide streak of light
  through the striking part, across the screen, with a white-hot heart: a row of `-` strokes written
  on the letter grid (three rows thick near the heart, a short upright stroke through it, a soft
  cloud of letters round it). It opens at full size on the cue frame, holds 0.1 s and draws back into
  its heart (0.34 s in all). It is steel in the fire field, **dyed** by a tint zone (`FireField.tint`,
  `TELL_STYLE[tell].flare`): **red** = dodge, **blue** = parry, **black** = dodge (the cells behind its
  letters are blacked out: a dark bar round a white-hot thread). A light in its colour, small strokes
  thrown out along it, the HUD's screen edge in its colour for 0.25 s. Data: `TELL_FLARE` in
  `enemies/duelist/fx.js` (the owner picked the streak from a sheet of three; the star and the lance stay behind `?flare=star|lance`; `?flare=blaze` draws the
  old red blaze); the wyrm draws it 1.5x as big, and one streak for a blow of both forefeet.
- **Nothing before the cue.** A red blow no longer glows through its windup (`TELL_STYLE.red.warn`
  `from` = `to` = 0; it ramped 0.1 → 0.38) and a boss's own red area no longer marks the floor
  (`TELL_STYLE.red.floor: false`: a duelist's ring of red letters, the ground heating under the
  wyrm's stomp, pounce, leap, dive and nova). The windup is read from the animation and the audio
  sting; the flare says when. On the cue the body still spikes red (1.6, gone in 0.25 s).
  **What lands away from the boss keeps its ground mark** (a flare on him cannot say where): meteors,
  chase pillars, burning strips, the hover barrage's shells, the wyrm's ambient cinders, the Lord's
  sky bolts, Dark Star and thrown stones, a felled pillar's strip (*Hazards*, ADR-052). Armageddon's
  rear-up still glows. **Not the wyrm's thrown terrain** (ADR-119, the owner: "don't show exactly
  where the terrain will land"): nothing on the ground, the flare drawn on the flying piece 0.35 s
  before it lands (until then the landing glowed and followed the hero until the throw, ADR-110).
- **The charge (`black`).** A black blow is wound up for about 1.5 s plus a held beat that is never
  the same (0.1 - 0.6 s). Through it darkness is drawn into the striking part: an eclipse that grows
  on it (a disc of blacked-out cells with a pale corona), motes of pale light pulled in from all
  round, the body darkening (`TELL_STYLE.black.warn`), the screen edge dimming (`combat:charge`).
  The levels are dark, so black is drawn by what rings it. Then the black flare.
- **Parryable (`normal`, `blue`) — the animation is the tell.** No colour coding during the windup
  (audio: a faint tick, or a blade "shing" for `blue`). On the cue a brief **white cross** pops at
  the striking part with a short bright "ting": one row of `-` (13 cells) through one column of `|`
  (7 cells), white-hot digits where they meet, written on the letter grid (0.2 s; it opens at full
  size on the cue frame and draws back into its heart). `blue` (heavy, big-posture) gets the same
  cross 1.6x as big (21 x 11 cells) with diagonals, an **eight-point star**, and a thin ring of
  strokes opening round it (0.28 s), and a richer ting — still white, never blue.
- **One design for every boss (ADR-113).** The three cues are drawn by `DuelFx.tellFlash(tell, x, y,
  z, k)` in the fire field (data: `TELL_GLINT`, `TELL_BLAZE` in `enemies/duelist/fx.js`); the wyrm
  draws its own through the same code at 1.5x. The red cue is a ragged blaze of red letters thrown
  out of the part (12 rays, no straight line in it: it must never be mistaken for the white cross),
  with red sparks and a red light. A duelist's dodge-only AREA is a burning ring of red letters on
  the floor through the windup, with an inner ring closing in; the wyrm's areas heat the ground as
  before (ADR-052).
- **Hazards warn on the ground, diegetically (ADR-052).** The ground they will hit heats up: a
  sparse fill of small ground glyphs and the scorch map's heat, dark ember at spawn, orange by
  half way, white-orange at impact, sparks rising near the end; a thin bright rim marks the exact
  edge only in the last `flashLead` s; on the flash the heat flares. A strip heats ahead of its
  fire front (hottest just ahead of it), a flame ring where it catches round the body, a wall along
  its line. No red rings, no `!` marks, no chevrons. Meteors and chase pillars announce themselves (their own `combat:tell` /
  `combat:flash` with `hazard: true`): audio plays a lighter cue (no brass sting, no music dip) and
  the HUD skips the red screen edge, so a meteor storm doesn't pulse the screen. The other hazards
  are covered by the spawning attack's own tell (the wyrm glows red through that windup).
  Armageddon's rear-up and salvo glow red on the body (`dragon.bodyWarn`) but send no tell: the
  salvo deals nothing, and each meteor warns for itself.
- **How a red blow was shown until ADR-118** (kept for reference): the body glowed red through the
  windup, a duelist's area ringed the floor in red letters, and the cue was a ragged red blaze
  (`TELL_BLAZE`). The owner asked for the flare instead of "a red circular area of where the attack
  will land".
- The glow clears the moment the windup is cancelled: stagger, posture break, parry recoil, the
  plunge's reaction, death, reset, or a Lab interrupt replacing the attack.
- After-the-fact feedback (PARRY / DEFLECT / DEFLECT ×N / GHOSTEP / EXECUTION / GUARD BROKEN
  call-outs, white/gold parry sparks, the clang that climbs with a deflect chain) is not a tell and
  stays.

## Contract (summary — full signatures in ARCHITECTURE.md)
- Attacker → defender: `defender.takeHit({ damage, from, knockback, knockdown, kind, burn, tell,
  parryable, blockable, attack, attacker, plunge, steel, last, melee, around })` returns a `RESULT` (`hit` / `blocked` / `clashed` /
  `parried` / `dodged` / `perfectDodge` / `ignored`). `plunge: false` keeps a perfect dodge of that
  hit from becoming the plunge (fire hazards).
- How the hero takes a hit he does not answer (ADR-083): a **flinch** (0.4 s) gives the way the
  blow drives him (back, forward over a blow from behind, to the side); a **knockdown** (1.3 s, the
  last 0.5 s invulnerable) falls away from the blow, onto his back from the front or a side and
  onto his front from behind, his facing easing square to it as he falls; killed while down he
  dies where he lies, otherwise he drops to a knee on his sword and falls forward.
- On `parried` the attacker calls its own parry reaction: a deflect for a string's non-final hit
  (posture + a knock-back; `dragon:parried {hit, last}`, `combat:deflectChain {count}`), a recoil
  (posture + the punish window) for its last hit or a single melee attack.
- On `perfectDodge` the defender plunges onto an attacker that offers `plungePoint(out)` /
  `onPlunge(o)` (in range, allowed by the hit), takes the slow-mo in place when it can't, and
  Ghosteps behind an attacker without that API.
- Attackers announce tells via events: `combat:tell` at windup start (per hit), `combat:flash` at the
  timing cue. The attacker draws its own tell in the world (red windup glow via `uWarn`, white
  glint / red burst on the flash, the ground heating up for areas and hazards); audio plays the
  cues; the HUD adds only the red edge flash (not for hazards).

## Player moveset (owner concept sheet "Combat key poses")
Numbers live in `src/entities/player/combat.js` (`LIGHT`, `SPRINT_ATK`, `ROLL_ATK`, `CLEAVE`,
`THRUST` (the execution's), `CHARGE`, `REACH`); the swings' key poses in `src/entities/player/swings.js`
(ADR-071); movement / defence timings in `TUNE` (`player.js`). The LMB chain is five hits (ADR-041;
it was sweep, backhand, slam: "the same 3 attack patterns"). Hits 1–4 are one-handed, the free hand
in sword fingers (jian jue) answering the sword hand: it points at the foe in the coil, gathers on
the sword wrist before a backhand and splits from it as the cut goes out, and ends each cut in one
line through the body against the blade, out of its path (swings.js `FH`); he walks through them:
the lead foot changes with every hit. The slam and the charged cleave are two-handed, the free fist
shown on the grip only once the hand is there (`OFF_SNAP`).

| Move | Input | Timing (windup / active / recovery) | Damage | Posture | Notes |
|---|---|---|---|---|---|
| 1 — falling cut | LMB tap | 0.11 / 0.12 / 0.24 s (0.47 s) | 30 | 5 | one-handed: cocked beside the head (blade up-back-right), the sword fingers pointing at the target; a diagonal down across the front as the hips turn through and the body sinks, ending low past the left hip while the fingers draw back high-left like a bow; cyan crescent |
| 2 — backhand | LMB tap in the recovery | 0.11 / 0.12 / 0.24 s | 32 | 5 | back across his front from the left: rising from the left hip to high right, the body rising with it (or level at chest height with a pivot, or falling from over the left shoulder); the sword fingers gather on the sword wrist in the coil and split from it, opening out to his left (the falling one tucks them before the chest and draws them back high) |
| 3 — whirl | 3rd tap | 0.13 / 0.15 / 0.26 s (0.54 s) | 36 | 6 | he follows the backhand round to his right: one full turn with the sword arm thrown out level and the free arm tucked before the chest through the turn, then flung wide as the brake, dropping into the turn and leaning to the inside of it, his head staying on the target and coming round ahead of the body; the blade crosses the front about two thirds of the way round, inside the active frames, and carries on round to his right |
| 4 — lunge | 4th tap | 0.11 / 0.10 / 0.24 s (0.45 s) | 30 | 6 | one-handed: the hand draws back to the right ribs with the point already up and the sword fingers at the foe, then one long line from the fingertips behind the hip through the arm to the point, driven forward and UP at 35° (the rising thrust: 45°, its fingers and point converging on one spot). Both thrusts rise (ADR-077): a level blade pointed toward the game camera is drawn straight down the screen to the grass at his feet, as if planted in the ground |
| 5 — slam (finisher) | 5th tap | 0.28 / 0.13 / 0.42 s (0.83 s) | 66 | 18 | two-handed (ADR-076): he gathers (dips and coils right, the blade drawn down-back past the right hip), leaps as the blade sweeps up his right side and cocks over the shoulder, and brings it down in one diagonal across his front into the ground ahead and a little left, landing folded over the planted blade and holding it; a crystal-shard burst (r 1.7 m) at the point hits if the blade missed |
| Sprint slash | LMB while sprinting (faster than a run) | 0.11 / 0.13 / 0.32 s | 40 | 7 | a bounding rising slash, low right → high left; carries 2.4 m along the RUN direction (it does not snap to the aim); counts as hit 1 (the next tap is the rising backhand) |
| Roll cut | LMB out of a forward roll | 0.10 / 0.11 / 0.26 s | 34 | 6 | a low cut rising out of the crouch, right → left; counts as hit 1. A backstep (Space with no direction) starts the plain chain |
| Cleave — charged | hold HEAVY ≥ 0.3 s, release (ADR-115; it was the attack button's) | 0.08 / 0.24 / 0.45 s | 70–110 by charge (full at 1.2 s) | 12–20 | a deep stance coiled away from the target, both hands on the grip held out before the right side of his chest, the sword elbow lifted out to the side and the off forearm across the chest (ADR-078), the blade standing nearly upright out to his right, a hand's width clear of his hood (ADR-090: it stood beside the ear and crossed his face) (moves at ×0.4; lightning crawls on the blade past half charge); the release dashes 2.2–3.6 m along the facing with the blade still cocked and carves one two-handed diagonal, high right to past the left hip, as the dash dies out (the blade crosses his front over the last 45 % of the active frames), sinking into a long low lunge that he holds, the free hand letting go and snapping into sword fingers at the foe while the blade trails low behind; a wide crescent that hangs in the air (cooling to violet), and on a hit a 0.15–0.2 s freeze, a doubled slash line with a tick across it, a ring, a fan of streaks along the cut, a 0.14–0.24 m kick and a 1.2–2.0 m punch (ADR-072; it was a lunging thrust) |

- **Heavy branches** (ADR-115; owner: heavy branches off the chain; numbers in `combat.js` `HEAVY`, a
  first pass to tune from play): HEAVY (RMB / R2 / the HEAVY tile) pressed on its own, or in the
  recovery of the n-th light (from its `chain`, or buffered through its cut), is that point's own
  heavy. Each is two-handed and holds its finish; each ends the chain (the next light is hit 1).
  Held past `CHARGE.hold` (0.3 s) a heavy press is the charge instead. A light press no longer waits
  to see whether it is held: it cuts at once.

  | Input | Heavy | Windup / active / recovery (s) | Damage | Posture | Its job |
  |---|---|---|---|---|---|
  | H | Piercing Gale | 0.30 / 0.14 / 0.42 | 54 | 34 | a two-handed thrust on a 2.8 m dash: the gap closer |
  | L-H | Rising Crescent | 0.28 / 0.14 / 0.42 | 50 | 36 | rises from the left hip to high right; staggers a duelist (`reel` 2) |
  | L-L-H | Whirling Tempest | 0.28 / 0.18 / 0.44 | 52 | 30 | a full two-handed turn: the blade all round him |
  | L-L-L-H | Mountain Splitter | 0.34 / 0.14 / 0.46 | 62 | 50 | a falling diagonal from over the left shoulder; its poise (50 ≥ crushPoise 48) crushes a raised guard |
  | L-L-L-L-H | Earthbreaker | 0.32 / 0.13 / 0.50 | 84 | 52 | the slam with a higher leap and shards in 2.6 m (the plain slam: 1.7) |

  Checked by `npm test`: REACH swings every heavy at contact, 2, 2.5, 3 and 3.5 m from the wyrm's
  chest; duel HEAVY (the branch at each point, the crush through his guard, the stagger, the charge on
  the heavy button, a light that never charges).
- **Variants** (ADR-055, ADR-071): hits 1–5 each have 2–3 looks, picked at random as the hit starts
  (never the same one twice in a row, and never along the line the swing before it cut, so two hits
  in a row are never in the same plane): 1 falling cut / low draw cut / rising slash with a skip;
  2 rising backhand / flat backhand with a pivot / falling backhand; 3 whirl / rising whirl / a
  crouching low sweep; 4 lunge / rising thrust out of a crouch; 5 the slam with a leap / nearly grounded (one clip; both come down from over the right shoulder: a diagonal). A variant
  changes only the look: the timing, damage, posture, reach and lunge in the table are the hit's,
  and every variant connects from the front at contact, 2 m and 3.5 m (the REACH test). The sprint
  slash, the roll cut and the cleave have one look each.
- **Diagonals** (ADR-071): no cut runs straight up and down. The blade stays under ~45° of
  elevation through a cut and crosses his front near chest height, so a "falling" cut runs from a
  high shoulder across the chest to the far hip. The camera looks down from behind him: a cut in an
  upright plane is drawn as one straight bar up the screen. The blade whips: the hand runs ahead
  through the first half of a cut, and the blade comes through and passes it as the cut ends.
- Poses follow the owner's key-pose sheets (`docs/art/hero.md` §4); the timings above are unchanged
  by them. The dodge roll stays 0.6 s (the sheet draws 0.55 s; shortening it is a tuning decision
  that would move the i-frames, so it was not taken). The light swings' blades cross his front at
  mid-active (the low sweep later, at ~65 %: a low blade reaches less far under a tall target): a
  cut that crossed earlier swung past the front before the step-in assist closed the gap and lost
  the 3–3.5 m REACH cases.
- **Cancels (ADR-080):** a guard press (RMB) or a dodge (Space) cancels a swing **at any point**:
  its windup, the cut itself, the recovery (only the execution's thrust runs to its end). A cut
  cancelled before it lands does not land. A flask still waits for 35 % of the recovery, movement
  for 60 %. (Until 2026-11-14 the guard came out of windups and recoveries only and a dodge only
  after 35 % of a recovery: a hero mid-swing could not answer a counter.)
- Pacing (ADR-075): a light is a short gather, a quick cut and a held finish (0.11 / 0.12 s, then
  the next light may start 30 % into the recovery: `chain`), so a mashed chain lands a hit every
  ~0.32 s. History: 0.25 s a hit until Session 25, where the owner found the swings "too fast to
  follow" and they went to 0.42 s with a 0.18 s cut; then "its too slow right now" (Session 26). The
  cut is now as quick as the old one; what makes it readable is the pose at each end and the arc
  that hangs behind the blade (ADR-074). The slam has a `chain` too: a mashed button no longer cuts
  its landing off (the next chain starts ≥ 0.13 s after the blow). A roll / flask cancels a recovery
  after 35 %, movement after 60 %; RMB raises the guard out of any windup (not the active frames).
- **The recovery flows** (ADR-076): he starts back to the ready stance 30 % into the recovery (a
  clip's `home`), while the follow-through is still moving, so the blade never stands still between
  the cut and the way home and comes home at about half the cut's speed (it stopped for two frames
  and then snapped home in 0.12 s, as fast as it had cut). The slam and the cleave hold their finish
  (`home` 0.55).
- **Reach against giant targets** (`REACH`): the wyrm's chest hangs 2–4 m above the grass, above a
  sword swung at a 1.75 m hero's chest, so the blade hits through a **vertical band**: a hurt sphere
  counts when it overlaps the blade's swept wall extended `up` 2.6 m above (the slam: 1.0 m) and
  `down` 0.5 m below it; the hit segment runs 0.4 m past the steel (the edge wave). Swings **step
  in** toward a hurt surface within 4.8 m and 0.8 rad of the facing (lunge stretched by ≤ 1.3 m).
  The step is a push-off and a brake (`TUNE.lungeShape`): ~90 % of it is done as the front foot
  plants (0.45 of the active frames) and he stands still as the cut ends (it was an even glide to
  the end of the active frames, the body sliding on past the planted foot); a light held past a
  click and released before the coil steps all of it from the release.
  Result (`npm test` → scenario REACH): all five chain hits and the cleave connect from the front
  of an idle wyrm from contact out to 3.5 m from its chest surface.
- **Chain pacing (ADR-041, ADR-071, ADR-075):** the five hits deal 194 damage in 2.76 s of full
  swings (70 per second; at the slow pace 237 in 3.79 s, 63). Mashed, the whole chain lands 194 in
  ~1.86 s, about 104 per second (the slow chain: 237 in ~2.17 s, 109): the lights' ×1.4 of the slow
  pace is gone (30 / 32 / 36 / 30 again) and the slam went from 58 to 66 for the beat its landing
  now holds. The old three dealt 120 in 1.94 s.
- The broad build (2026-11-09) kept the bones: the REACH table is unchanged; the hit segment moved
  by ≤ 2.5 cm on some active frames (ARCHITECTURE.md, animator).
- Not in the table: **the plunge** (a perfect dodge of the wyrm) and **the execution** (an attack
  near a broken wyrm's head), below. A flying wyrm is out of sword reach: only the plunge gets there.

## The plunge and the execution (2026-11-09, ADR-027)
A perfect dodge of the wyrm (any tell, except a fire hazard) with its head within 30 m:
1. **Vanish** (0.05 s): a cold afterimage at the dodge spot; the ×0.3 slow-mo starts (0.6 s real).
2. **Hang** (0.13 s, inside the slow-mo): he reappears 5 m above the head, 0.3 m out toward his
   landing side, coiled in a reverse grip. (The 58° camera sees height at about half scale: at the
   design's 2–3 m he was drawn on top of the head.)
3. **Dive** (0.14 s): accelerating onto the head as time snaps back.
4. **Impact:** 90 damage to the head, final (no head or break multiplier; the phase gate holds),
   +40 posture; a 0.13 s (real) hitstop at ×0.03 and a heavy shake. The wyrm's `plunged` reaction
   cancels its attack (not a phase transition or its death): the head is slammed to the ground, it
   thrashes and rises (1.35 s). A wyrm hit in the air falls (~0.6 s, longer from higher up) and
   crash-lands first.
5. **Ride** (0.42 s): he holds his place on the skull as it is slammed down.
6. **Flip** (0.5–0.85 s, apex +1.7 m): a backflip to a landing you can see, 4.5–12 m in front of
   the head toward where you came from (≥ 0.8 m clear of the body, inside the arena).
7. **Land** (0.34 s, free to act after 0.12 s): the crit window (2.2 s, ×1.8) opens with 0.2 s of
   i-frames.

The whole move is invulnerable (every hit is ignored) and takes ~1.6–1.9 s of game time (~2.2 s
real). The camera keeps the hero and the head on screen throughout.
**Execution:** while the wyrm is posture-broken, an attack press with its head within 9 m starts
the same move at the hang (no slow-mo, no perfect-dodge events): 260 damage (final), a heavier
reaction (slam 0.35, thrash 1.15, rise 0.5 = 2.0 s), and the break is spent (the meter starts over).
An EXECUTION call-out shows it. A plunge that lands during a transition roar (or the wake-up) only
deals its damage; a dying wyrm can't be plunged. Numbers: `DEFENSE.plunge` (`rules.js`),
`TUNING.plunged` (dragon).

## The streak and the flurry (2026-11-14, ADR-091)
Owner: "more different perfect dodge animations instead of the same one ... if the player keeps doing
more successful perfect dodges in a streak, make the attack also hit the # of attacks the player is
on a streak ... epic anime". Numbers: `DEFENSE.flurry` (`rules.js`), the arts in
`player/flurry.js` `ARTS`.

**The streak** counts perfect defences in a row (`player.streak`, the STREAK row of pips under the
HP bar): a perfect dodge, a **parry or deflect** of a blow of the body or the blade (not a deflected
bullet), a **trade clash** and a mikiri each count one (ADR-094; until then only perfect dodges). It
ends when a blow **hurts** him (a plain hit, a guard break, death). A blocked blow, a plain dodge, a
burn's ticks and time leave it alone (`keepStreak: 0`; a number there would let it run out).

**The flurry.** A perfect dodge of a **red** blow (ADR-102: a white or heavy blow's only counts in the
streak) that can reach its attacker (rule 5) is answered with N blows, N =
the streak, 7 at most (`max`; the streak itself counts on):
- **N − 1 flash cuts.** He vanishes (an afterimage where he stood), is on one side of the target, in
  the cut already, crosses it in 0.1 s and is gone again. Each cut runs along a new line, so they
  cross on the target like a star, and each leaves its line of light **hanging** there. A cut deals
  28 damage (final: no part or break multiplier, past a duelist's guard) and 5 posture, freezes him
  on the hit for 0.05 s, and rings a whole tone higher than the last. A long flurry speeds up (its
  last cuts take 60 % of the time of its first). Round the wyrm's head the cuts fly at its height,
  4.6 m to each side.
- **Against a duelist the cuts are paced to be followed** (`DEFENSE.flurry.ground`, ADR-101; a man
  is framed closer than the wyrm's head, and what suits a head three metres across hid him). Each
  cut: he appears 2.3 m to one side of him, is **seen wound up for 0.035 s**, runs in **past his
  side** (0.55 m off the line of the cut, each cut on the other side: never through his body),
  strikes 42 % of the way along (the blade on him, the two of them side by side in the freeze),
  comes out of it faster and **slows into a finish held 0.085 s**. About 0.35 s a cut (0.25 s
  before); a long flurry's last cuts take 75 % of the time of its first. The cut left hanging is a
  short line ON him (1.9 m to each side), and the flare, the crescent and the burst are 62 % of the
  wyrm's. The camera leans in 4 m (6 before) and takes 45 % of the punch and 65 % of the shake.
  The duelist is **not shoved** by a flurry's blows (a 0.32 m shove from a new side every quarter
  second read as him jumping about; the cuts cross where he stands): each cut **flinches him where
  he is**, out of whatever move he was in, and the last blow staggers him **away from where the hero
  lands** (he pitches forward when the hero ends behind him), never into him.
- **The art**, the last blow, one of three for each kind of target, at random and never the same
  twice running:

  | Target | Art | What it is | Lands |
  |---|---|---|---|
  | the wyrm | **Skyfall** | the plunge itself (below) | the plunge's 90 + 40 posture |
  | the wyrm | **Severing Line** | he hangs to one side of the head in a deep draw (0.22 s), crosses it in one level line (0.075 s) and holds the finish, his back to it (0.24 s): only then does the cut land; a backflip down | the same, through `onPlunge` |
  | the wyrm | **Heaven Splitter** | he hangs 4.6 m above the far side of the head, the blade raised (0.2 s), and cleaves down through it to the ground on the side he came from (0.13 s) | the same |
  | a duelist | **Passing Cut** | the same draw 3.1 m before him, past his side in 0.1 s (slowing into the finish), the finish held behind his back | 60 + 22 posture |
  | a duelist | **Falling Leaf** | 3.9 m above his front, the blade raised, down onto him and on to the ground behind his shoulder | the same |
  | a duelist | **Rising Moon** | crouched right before him, one rising cut, and over him in a somersault with a half turn (apex 2.5 m) | the same |

  On the last blow every hanging cut **bursts** at once: the lines flare wide and throw sparks off
  both sides, a run of rings sounds (one for each cut), and a banner names it (TWIN FLASH … SEVENFOLD
  FLASH) with the art and the damage of the whole flurry.
- **Time.** While he cuts, the world runs at 7 % of its speed (`world`) and the hero in real time:
  the boss stands in his blow while the cuts land. Time comes back on the last blow, with its own
  freeze (0.13 s) and shake. A flurry of two takes about 0.9 s, of seven about 2 s (the plunge as its
  art: its own 1.6–1.9 s more, as ever); against a duelist about 1.0 s and 2.6 s.
- He cannot be hit from the dodge to the landing. Against the wyrm he lands through the plunge's own
  flip and landing; against a duelist 1.5 m behind his back in the Ghostep's reappear. The crit
  window (2.2 s, ×1.8) opens either way, and against the wyrm the last blow is a plunge to it: the
  `plunged` reaction, the crash out of the air.
- The first perfect dodge of a streak is the art alone: against the wyrm that is the plunge one time
  in three. Against a duelist it is new: his back used to be offered, now 60 damage is dealt on the
  way there.
- Damage of a whole flurry: 90 + 28 × (N − 1) against the wyrm (118 at two, 258 at seven; the wyrm
  has 4500 HP), 60 + 28 × (N − 1) against a duelist (88 at two, 228 at seven; Shen Hui 3000, a
  form of the Starless Lord 1400).

**Weight** (ADR-094; owner: "add some weight, hitstun impact to the teleport attacks"). Every flash
cut freezes the hero on the contact (0.065 s), kicks and punches the camera harder with each cut,
and is followed by a beat (0.09 s) in which the world runs at 60 % instead of 7 %: the target is
SEEN to reel under it (a duelist is thrown as by a heavy blow and shoved along the cut; the wyrm's
head flinches) before it is held again. Under a foe on the ground a shock ring races out and dust is
thrown along the cut. The last blow holds its contact half as long again, freezes the frame (0.16 s),
throws speed lines across the whole screen, dips the screen dark for a blink and flashes it, breaks
the ground under a duelist, and **staggers** him (0.8 s: an opening on top of the crit window).

**The riposte** (ADR-094). Parrying the **last** blow of a string, or a single blow, of the body or
the blade is answered once the parry's own freeze is over: as many flash cuts as the streak counts
(that parry included; 7 at most), the last of them opening the hanging cuts, and the hero is back
where he parried, free at once. No art, no crit window, no plunge: the wyrm's recoil and a
duelist's (the punish window a parried last blow has always given) are still to come, and the world
was held while he cut. Only when the target is near: its head within 11 m on the ground plan, a
duelist within 6 m. A blade lock takes precedence (a perfect parry of a `lock` blow). Parries
inside a string only count. Damage: 28 × N.

### A foe's streak and his flurry (ADR-094, the duelists)
Owner: "give the streak system and attacks to bosses as well ... if the boss is on a high streak, the
player needs to parry / block the total # of attacks". Numbers: `DEFENSE.foeStreak`.
- **His streak** counts the strikes of the hero's that his guard turns, in a row (pips after his
  name on the boss bar, lit red from three). A strike that lands on him ends it.
- From a streak of **three**, a guard may answer with **his flurry** instead of the Riposte (50 % at
  three, 75 % at four, always from five; the strike is then beaten away for certain): Scattering Ash
  (Shen Hui), Starless Storm (the Lord, one for each blade form). As many cuts as his streak counts,
  seven at most. The first comes from where he stands (windup 0.62 s); before each of the others
  (0.48 s apart, each with its white glint) he is **gone and at another side of you**. A parry or a
  held guard meets them **from any side** (`hit.around`): it is a test of rhythm, not of facing.
- **Answer every blow** (a parry or a block each; a perfect parry counts two) and **his posture
  breaks**. Each blow answered takes one off his streak. A blow that lands, or one dodged, breaks
  nothing, and what was not answered stays in his streak. Every blow is a white tell: all of it can
  be parried, blocked or dodged; 14 damage a cut (the Lord 13).
- The parries count in your own streak, and the last one is a last blow parried: the riposte
  answers it while he breaks.
- The wyrm has no guard and no streak.

## Strings and the deflect chain (2026-11-09, ADR-026)
**Strings** (`attacks.js` `makeString`, data in `tuning.js` `TUNING.attacks[name].hits`): an attack
of N hits, each with its own kind (performance), tell, windup (+ an optional random `hold` that baits
an early parry), active, impact, damage and knockback; a hit with `chance` < 1 may be rolled out.
Every hit announces itself (`combat:tell` at its windup start) and flashes `flashLead` (0.35 s)
before its real impact, holds included. Data rules (checked by `npm test` → STRINGS, all phases): a
tell per hit, the first windup ≥ 0.7 s, the flash after the tell, ≥ `minHitGap` 0.45 s from one
impact to the next (time to release and re-press RMB). The seventeen strings are in *Current numbers*
(the seven of the whole body also in *The whole body*, below).
**Verifier** (`npm test` → TIMING): every string and single melee attack, started through the AI's
own start path from every placement the AI picks it at (phases 1–3, the hero standing still), lands
each contact within ±85 ms of its flash + lead (worst 67 ms on the merged build), and every pick
lands its first hit. Later hits can whiff a hero who doesn't move (the TIMING table counts them).
A string's bite connects at most `biteLate` (0.07 s) after its impact and otherwise misses (2026-11-20,
ADR-124: Cataclysm's held bite caught a hero 3 m away 102 ms after its flash).

**Deflect chain** (contract 1): parrying a hit that is not its string's last does not cancel the
string: the posture damage applies (`POSTURE.parry`), the struck paw / head is knocked back for
0.14 s (visual only) and the next hit comes on schedule. Parrying the last hit (or a single melee
attack) recoils the wyrm as before (the punish window). `dragon:parried` carries `{hit, last}`;
`combat:deflectChain {count}` fires from the 2nd parry in a row within one string (a hit that lands
or is blocked resets the count; dodges keep it) and shows as "DEFLECT ×N" over the hero. On the
hero's side each parry in rhythm (≤ 1.1 s apart) snaps the blade to the other side, slides him back
0.16 m (×1.6 for blue), grows the clash and raises the clang two semitones; the next tap counts at
once (rule 4). A red hit inside a string can't be parried or blocked: dodge it (a perfect dodge →
the plunge, which cancels the string). Rending flurry parried hit by hit: `dragon:parried` [0, f],
[1, f], [2, f], [3, true], chain 2 → 3 → 4, +148 posture, no damage (STRINGS scenario).

## Three phases (2026-11-09, ADR-028; the pressure: 2026-11-15, ADR-119)
P1 100–66 %, P2 66–33 %, P3 33–0 % of 4500 HP, each threshold a gate until its transition roar
(always phase-1 timings; the red shock ring, 12 damage, which also clears the hazards). Later phases
speed the windups and recoveries up (× `phaseTimeScale` [1, 0.82, 0.7]; the swings keep their speed),
turn and walk faster, pause less, link more, grow the posture meter and glow hotter: phase 3 burns
white-hot (crack glow 0.8, 50 body embers / s) and opens with the Inferno nova. **In phase 3 the wyrm
is ablaze** (2026-11-16, ADR-120; ARCHITECTURE.md "The wyrm ablaze"): 0.45 s after the transition
roar's ring, fire runs out from its chest along its wings, legs and tail and flares at every end, and
from then on flames stand on its wing tips, claws and the last third of its tail. **It adds no
damage, no tell, no hit volume and no timing**: every attack hits, hurts and is told exactly as
before, nothing of the body's fire touches the hero, and its burning footprints in the grass are
scenery (stand in them). Wood a burning part sweeps past catches (the world's fire under its usual
caps: a tree alight burns the hero beside its trunk as any burning tree does). A timing cue dims the
body's fire round it, a red or black glow dims all of it, and a flame next to the hero burns low, so
the cues stay readable. A pending transition
waits for a plunge reaction to finish. A new phase's abilities unlock one by one (opening cooldowns
1.5 + 1.6 × i + 0–1.5 s, in a random order; not the nova, not the roar: `pressure.unlockSkip`, nor an
attack tuned `unlock: false`), not all at once after the roar.

**Harder means more pressure at the same damage** (the owner's answer, ADR-119): a mistake costs what
it did before (no damage band was added), but the fight gives fewer pauses to recover in. How:
- **Shorter pauses.** Between two moves the wyrm waits `idleGap` [0.25 – 0.5, 0.25 – 0.5, 0.05 – 0.25]
  s (v0.6: 1.0 – 1.7, 0.7 – 1.2, 0.35 – 0.7). **The hero's openings keep the old pause**
  (`pressure.openingGap`, the v0.6 numbers): after a parry recoil, a stagger, a posture break, a
  plunge reaction, or a move he answered with his flurry or his counter. Between moves it walks at
  where he is heading (3.6 / 4.6 / 5.3 m/s, cutting him off past 12 / 11 / 10 m), turns at its
  attack turn rate × [1.15, 1.1, 1.05] (rolling behind it is a moment, not a place to stay; faster
  read as a pirouette when filmed) and through a longer pause near him sidesteps.
- **Combo links.** When a move ends on its own, it may flow straight into another with no pause:
  every one of the 45 attacks lists follow-ups by where the hero is as it ends (behind → the tail;
  at the side → a pivot, a swipe; in front → a short follow-up such as a stomp, a bite or the Cinder
  spit, or from phase 2 another string or a fire move; mid range → a pounce, a wing, a flight; far →
  the charge, a shot, a flight), each with a chance per phase (`tuningLinks.js`). Phase 1 links short
  follow-ups and rarely, phase 2 most moves, phase 3 nearly all. At most `chainDepth` [3, 3, 5] links
  in a row, then a breather (`chainRest` [0.7 – 1.0, 0.8 – 1.1, 0.4 – 0.65] s). A move that was
  parried into a recoil, staggered, broken or plunged never links (the opening is kept).
- **A director over the dice** (the weighted pick is steered, ARCHITECTURE.md "The director"): every
  attack has a category (melee, wing, tail, fire, flight, spell, terrain); no more than two picks of
  one category in a row; a category absent too long (32 / 15 / 12 s) comes back stronger, and past
  three times that it is the pick (the wyrm closes in or turns for it if it must); gap closers when
  the hero is far (beyond 15 m: charge, pounce, leap, the flights), tail moves when he is behind;
  ceilings on time in the air (18 / 24 / 30 % of the last ~20 s) and on live hazards (3 / 5 / 7) before
  another flight or spell.
- **Ambient cinders** (from phase 2): while it fights, small fire shaken from its wings and spat from
  its jaws falls near the hero, 1.5 – 4.8 m round him (some aimed where he is going), every 1.4 /
  0.7 s on average, 1 – 2 / 2 – 3 at a time, at most 3 / 6 near him. Each is a red blast (r 1.6 /
  1.9 m, 14 damage before `damageScale`, burn 1, kb 2) whose ground heats for 1.2 / 1.05 s and that flares 0.35 s before it
  lands: roll, or step out. A cinder only falls near him while a ground move runs with time left,
  never within 0.3 s of another known blow, never during a breath, a guard-tell bullet pattern or a
  string that scatters embers, never while bullets fly, and only where at least 6 of 17 spots (his and
  16 a roll away) stay clear of every blast due in the next 1.4 s. When none may fall near him they
  fall 8 – 13 m away: scenery, no cue, no blow.
- **Fairness is enforced** (rule 10): the 0.3 s rule between cues of different answers, held melee
  blows (up to 0.5 s), patterns and spells that do not layer, moves of the other answer that wait.

**The shape of each phase** (what the weights, links and floors add up to):
- **Phase 1** hunts on the ground: claws, jaws, the wing scythe and the tail strings (Wing rend,
  Pivot lash, Rear guard, Sky hammer), the black maw, the Cinder spit between strings, the terrain
  throws, the Ember torrent's one lane and the Cinder burst, and one flight: the Hunting flight (a
  pass and a dive).
- **Phase 2** brings fire into the strings (Furnace maw, Cinder rake, the burning ground they leave),
  the Furnace flight, Armageddon, the eruptions with their pools, two flame rings, the Ember rain, the
  Scouring breath, the firebrand and the ambient cinders.
- **Phase 3** is the cataclysm: the 7 – 9-hit string, the Cataclysm flight (four parts), five waves of
  meteors, three flame rings and a second flame wall, the Fire lanes, chains of up to five moves, more
  cinders.

**Measured** (ADR-119; the PRESSURE scenario of `integ.mjs`: five seeds, 120 s a phase, a bot that
blocks and rolls). Cues a minute by phase: main 24 – 28 / 26 – 51 / 37 – 54, now 31 – 37 / 53 – 63 /
72 – 86 (phase 1 is under its target of 34 on two seeds of five, phase 3 under its 78 on three; the same tuning gave 70 – 96 in phase 3 between runs).
Longest gap between cues in phase 3: 2.2 – 3.2 s (main 5.6 – 10.3 s on three seeds). Chains per
phase: 5 – 22 (main 0). A mortal defender that answers 95 % of the cues wins all three runs (45 – 89
damage taken; on main it died in one of three); one that answers 80 % dies in all three (main: two of
three); the worst single blow is 34, as before. The meter's bounds (`pressure.meter`): each phase at
least 1.12 × the cues a minute of the one before, at least 28 / 48 / 64 a minute, no gap longer than
5.5 / 5 / 4.5 s. **Nobody has played it yet:** these are bots that answer in a frame.

## The whole body: melee kinds and strings (2026-11-15, ADR-119)
The owner: "more cooler melee attacks mixed with wing attack, tail, and fire attacks instead of just
using his hands a few times". Six new kinds of blow (`attacks.js` `KINDS`), each read from the body:

| Kind | What it is | Tell | Answer |
|---|---|---|---|
| **Wing scythe** `wingSweep` | one wing drawn up and back over the hero's side, then brought down and across the front in one stroke while the body pivots into it: the fingers rake through him low | normal (white) | parry it (or block, roll); it gives ground, so it can turn the next blow away |
| **Wing slam** `wingSlam` | both wings raised and brought down in front, on a spot locked 4 – 7.5 model units ahead (r 3 × S); a slam of air and dust | blue flare in Sky hammer and Cataclysm; red in Furnace maw | blue: parry it and the hero counters (the string ends); red: roll |
| **Tail whip** `tailWhip` | a pivot that puts the hero about 1.7 rad off the nose, then a short whip of the tail through him (165°) | red | roll (a perfect dodge: the flurry round the head) |
| **Tail slam** `tailSlam` | the tail raised over its back (2.6 × its arch) and hammered down along a line, 0.9 model units either side; a ground shock | red, knockdown | roll aside; a guard breaks; from phase 2 the line burns 1.6 s |
| **Fire snap** `fireSnap` | the jaws open into a short gout of fire, a cone of 7.5 × S m and ±24°, tracking the hero a little after a whirl in its windup | normal, **blockable, never parryable** | block it (chip), roll through or step out of the cone; it leaves a burning strip on the ground (1.4 – 1.6 s, 3 every 0.3 s, blockable, never while rolling) |
| **Ember rake** `emberRake` | a claw rake whose arc burns from phase 2 (1.8 – 2.2 s of burning ground) | normal | parry it; then do not stand in the arc |

`side: 0` on a claw, a wing scythe or an ember rake strikes from the side the hero is on as that
hit's windup starts: after a tail blow has turned the wyrm round, its next blow comes from where he
is now. The burning ground a fire blow leaves is contact fire only (no second, red blow).

**The new strings** (hits: tell; P1 windup / active / impact s; damage before `damageScale`):

| String (phase ≥) | Hits | Recovery / cooldown | Weight [P1, P2, P3] | AI band (× S from the root) |
|---|---|---|---|---|
| Wing rend `wingRend` (1) | claw (N; 0.75; 15) · wing scythe (N; 0.65 / 0.4 / 0.27; 18, kb 4) · 70 %: claw held (N; 0.5 + hold 0.2 – 0.6; 16) · lunge bite (**B flare**; 0.6 / 0.24 / 0.05; 22) | 1.0 / 7 | [2.6, 2.2, 1.6] | 3.0 – 5.4, ≤ 0.9 rad off the nose |
| Pivot lash `pivotLash` (1) | tail whip (R; 0.85 / 0.3 / 0.24; 22) · wing scythe (N; 0.8; 18) · claw (N; 0.55; 16) · 60 %: tail whip back (R; 0.7; 22) | 1.0 / 7 | [2.2, 2.2, 2.0] | 2.4 – 7.0, ≥ 1.0 rad (at its flank) |
| Rear guard `rearGuard` (1) | tail slam (R, knockdown; 1.1 + hold 0 – 0.3 / 0.34 / 0.34; 32, kb 5) · tail whip (R; 0.75; 22) · wing scythe (N; 0.7; 18) | 1.0 / 8 | [2.2, 2.2, 2.0] | 5.0 – 6.0, ≥ 2.2 rad (behind it) |
| Sky hammer `skyHammer` (1) | overhead (N; 0.75 / 0.24 / 0.22; 18) · bite (N; 0.55; 18) · wing slam (**B flare**; 0.95 / 0.3 / 0.3; 30, kb 6; from P2 it scatters 4 embers) | 1.1 / 8 | [2.0, 2.2, 2.4] | 2.4 – 5.4, ≤ 0.9 |
| Furnace maw `furnaceMaw` (2) | claw (N; 0.75; 15) · claw (N; 0.45; 15) · bite (N; 0.55; 18) · fire snap (N, blockable; 0.6 / 0.6; 6 per 0.12 s from 0.12 s in, burn 0.8) · wing slam (R, knockdown; 0.9 / 0.3 / 0.3; 32, kb 6; 5 embers) | 1.2 / 9 | [0, 2.8, 2.6] | 2.4 – 5.4, ≤ 0.9 |
| Cinder rake `cinderRake` (2) | ember rake (N; 0.75; 15) · ember rake (N; 0.45; 15) · tail whip (R; 0.7; 22) · fire snap (N, blockable; 0.7 / 0.6) · 50 %: bite (N; 0.55; 18) · overhead (**B flare**; 0.65 / 0.24 / 0.22; 22; 4 embers) | 1.3 / 10 | [0, 2.6, 2.6] | 2.4 – 5.4, ≤ 0.9 |
| Cataclysm `cataclysm` (3) | ember rake (N; 0.75; 14) · ember rake (N; 0.42; 14) · bite (N; 0.65 + hold 0.25 – 0.6; 18) · wing scythe (N; 0.55; 18) · tail whip (R; 0.65; 22) · fire snap (N, blockable; 0.65 / 0.6) · 60 %: ember rake (N; 0.45; 14) · 60 %: claw (N; 0.45; 15) · wing slam (**B flare**; 0.85 / 0.3 / 0.3; 32, kb 6; 6 embers) | 1.3 / 12 | [0, 0, 3.0] | 3.0 – 5.4, ≤ 0.9 |

What each asks of the player: Wing rend is four parries (the held claw baits an early press; the bite
is the counter); Pivot lash and Rear guard punish standing at its flank or behind it (roll, parry,
roll); Sky hammer ends on a parry moment; Furnace maw is parries, a held block through the fire, and a
roll; Cinder rake mixes parries, a roll and a block and ends on the counter; the Cataclysm is all of
it in one breath. The embers a slam scatters drop on the hero one by one a beat later (parry them).

**The old strings, re-weighted** (the hands-only feel): Claw combo [1.8, 1.2, 0.9], Rending flurry
[1.8, 1.4, 1.2], Hesitant maw [1.5, 1.6, 1.4], Wing buffet [1.8, 2.0, 1.8], Cinder flurry [0, 2.0,
2.2], Black maw [1.1, 1.3, 1.2], the claw swipe 1.6 (was 2.6). The Storm flurry's third hit and the
Frenzy's fourth are now a wing scythe (the Storm flurry's overhead from the side he is on, 2.4 model
units of lunge), and the Frenzy is weighted 1.8 in phase 3 (was 3.4).

**The breath has a body** (the owner: "him breathing out a cone of fire and circling looks bad"): its
aim is a heavy spring (`breath.track`: stiffness 9, damping 5, at most 1.6 rad/s² and 32°/s, 50°/s for
the phase-2 rake), the neck carries it within `neckArc` 0.45 rad of the facing, and only past that
does the body shuffle round, at `bodyTurn` 0.7 rad/s (it was 1.2: a turntable). The fire kicks back
(`recoil` 0.35 s) and surges 1.3 times a second. Weight [1.0, 1.2, 0.7] (was [2.2, 2.64, 2.64]).

Checked by `npm test` → MELEE (each new kind answered: the Wing rend parried hit by hit, a tail whip
rolled, the tail slam rolled and blocked (the guard breaks), the Sky hammer's wing slam parried into
the recoil, the fire snap blocked tick by tick and its burning strip, the rakes' burning arcs, the
breath's body turning far less than its stream sweeps) and TIMING (every contact of all seven within
±85 ms of its flash + lead; its list is every string but the Cinder flurry, and four singles). **Not right yet** (ADR-119): the wing scythe misses on 25 – 60 % of the
placements in the Storm flurry, the Cataclysm and the Frenzy (cause not found); Pivot lash's claw lands
on 124 of 174; the tail slam's raised arch barely reads.

## Fire attacks and hazards (2026-11-09, ADR-029, ADR-030; flying combos and the reworked apocalypse: 2026-11-15, ADR-119)
- **Flying combos** (ADR-119; the owner: "more flying attacks that are combos instead of just 1
  attack"): one take-off, then cued parts strung together in the air by banking turns, always ending
  in a dive whose crash landing is the last blow (and the opening after it). The parts:
  - **a pass**: a low strafe (7 m up) along a line over where the hero is heading, breathing fire
    down: the strip it lays burns [2.5, 3.2, 4.5] s by phase (4 per 0.25 s, blockable); its front is
    the red blow (26, burn 2, kb 4);
  - **a barrage**: hovering 9 m up, 12 m beside the hero, spitting [3, 3, 4] shells [0.6, 0.6, 0.55] s
    apart (at least the hero's roll cadence: one roll a shell), each landing in heated ground 0.4 s
    after its spit (15 each, ≤ 2 hits);
  - **a dive**: it wheels round to hover 9 m beside him for [0.95, 0.8, 0.7] s, tracking him, and dives
    (r 7.5, 34, knockdown, kb 7).

  | Combo (phase ≥) | Parts | Windup / recovery (s) | Weight [P1, P2, P3] / cooldown | AI gate |
  |---|---|---|---|---|
  | Hunting flight `skyHunt` (1) | pass, dive | 1.0 / 1.3 | [0.9, 0.25, 0.15] / 24 | 7 – 34 m |
  | Furnace flight `skyFurnace` (2) | barrage, pass, dive | 0.85 / 1.2 | [0, 1.1, 0.2] / 17 | 0 – 40 m |
  | Cataclysm flight `skyCataclysm` (3) | pass, barrage, pass, dive | 0.8 / 1.1 | [0, 0, 1.2] / 18 | 7 – 36 m |

  Every part's blow is red and cued (FLIGHT scenario: 2 / 5 / 7 tells and flashes, every blow within
  17 ms of its flash + lead, a hero rolling on the cues loses nothing). The pass's stream and the
  shells are breathed or spat from the air: **a perfect dodge of one plunges** the hero onto the flying
  wyrm's head, it crashes and **the combo ends there** (what it had not breathed or spat yet is taken
  back). Joining turns: a wheel 1.15 s, a swoop onto the next pass 0.65 s.
- **The single flights** (take off, attack from the air, land, all inside one attack) are picked far
  less now that the combos carry the flying: the **Burning pass** (a low pass over you breathing fire
  down; the ground it passes burns for 2.5 s), the **Sky dive** (climbs, hovers beside you while the
  ground under you heats, dives onto the spot: the crash landing is the blow) and the **Hover barrage**
  (3–5 fireballs from the air, each landing in heated ground). Flying, the wyrm is out of sword reach;
  its body circles are off.
- **Spells:** **Armageddon** (ADR-053, key `meteorRain`; replaced the Meteor rain; the performance and
  the sky reworked 2026-11-15, the owner: "his animation and shooting fire into the sky for the
  apocalypse needs to be improved"): a beat of menace (low, still, glaring), then the weight goes back
  onto the haunches, the wings unfurl, the throat and chest fill with fire, and it tears a dozen
  columns of fire up into the sky (1.4 s windup, 1.6 s cast; it deals nothing: rearing for ~3 s, it is
  open to a hero close enough to reach its legs and belly). A burning deck spreads over the sky above
  the clearing while it drops onto its forefeet with a slam and fights on. Then the meteors come down
  in waves over the whole clearing, falling on a slant from the sky above it: 3 waves of 8 (P2) / **5
  of 10** (P3; it was 4), 1.6 s apart, 0.12 s between impacts. Each heats its ground for 1.5 s (a led
  one 1.2 s): every 3rd is led onto you (never two within 0.5 s), the rest spread evenly, and within
  12 m of you a wave never covers more than 45 % of the ground, nor do two of its craters overlap by
  more than a third: there is always somewhere to stand. In P3 the craters burn on for 2 s (blockable
  contact ticks, never while rolling: walk out). 1.2 s after the last wave one great meteor falls on
  you (r 7, a 2 s warning). **Three looks** of the move exist behind `?apoc=a|b|c` (a: the salvo of
  columns from the ground, the default; b: one sustained pillar roared up; c: cast from the air, out of
  reach); **the owner kept `a`** (2026-11-16; b and c stay behind the switch). **Fire eruptions** (lava pillars in a line toward you; in
  phase 3 they may chase you instead; from phase 2 every pillar leaves a burning pool, r 1.9 m, for
  [–, 2.2, 3.2] s: 3 per 0.25 s, blockable, never while rolling), **Flame ring** (expands from the
  wyrm: roll through it or be beyond 20 m; **[1, 2, 3] rings by phase, one behind the other 0.95 s
  apart**, each its own red beat), **Flame wall** (sweeps across the arena: roll through it; **in phase
  3 a second wall 1.2 s later from your side, square to the first**), **Inferno nova** (a 2.5 s charge,
  then an arena-sized blast: flee beyond 22 m or perfect-dodge it).
- Every blow is red. Hazard-dealt blows never plunge, except fire breathed or spat from the air; the
  dive's crash and the nova's blast may (the wyrm is on the ground for both).
- Flash timing (`npm test` → FIRE, FLIGHT): every blow lands within 17 ms of its flash + lead.

## Bullets (2026-11-09, ADR-039; breathed, perfect returns and Hard: 2026-11-11, ADR-050, ADR-051; no wisps, no spinning, ground tongues: 2026-11-15, ADR-119)
The wyrm's bullet-hell patterns (`bullets.js`, `bulletAttacks.js`; numbers `tuningBullets.js`) fill
the arena with small fire projectiles that fly at the hero's chest height, and drive fire along the
ground in tongues. **Every bullet is breathed** (ADR-050): it leaves the wyrm's jaws along the way
its head points, at mouth height, and comes down to chest height before it reaches you (the head
draws in over a close hero so the stream is not fired over him). Nothing comes out of the body or the
wings, and **nothing homes**: the blue wisp swarm was removed (the owner: "remove the dragons blue fire
homing attacks as it looks bad"). **No spinning** (the owner: "his animation circling around looks
comedic"): while it breathes a pattern, the neck and the head do the aiming and the body never turns
faster than its walking turn rate (asserted for every pattern in every phase); the Ember torrent's
phase-3 pirouette and the Scouring breath's turntable (the whole body spun at 123°/s) are gone.

| Fire | Tell | Answers | Damage (final) |
|---|---|---|---|
| **Ember** (orange, small; straight, or lobbed from the sky in the Ember rain) | normal | parry · block (chip) · roll through · cut with a swing | 8 |
| **Orb** (red, big, straight) | red | dodge only | 20 + burn 1.5, kb 3 |
| **Tongue** (a line of fire crawling out along the ground from where a breath strikes it) | red | dodge only: roll through it, or stand where none runs | the pattern's (20 / 18 + burn) |

- **Perfect parry → return** (ADR-051). RMB ≤ 0.08 s before the impact: the ember comes back as a
  bigger white-gold shot (34 m/s) that hits the wyrm's head for 30 HP (≈ a light hit) and 14 posture
  instead of the deflect's, flinching the head (RETURN call-out, a gold burst, a 0.05 s stop, a
  brighter clang). Through the wyrm's own damage path: the phase gate holds, it may kill. It never
  interrupts the wyrm. Only the struck bullet returns. Orbs are never parried. A pattern gives back at
  most 120 HP in all (`returnBudget`, ~8 % of a phase: four embers); past that a perfect parry is a
  plain deflect, so returns never out-damage the sword.
- **Deflect.** A parried ember flies back to the wyrm's head (24 m/s) and adds 5 posture. It is a
  *light* clash (`player:parry {light: true}`: hit-stop 0.03 s, a quarter of the push back, a small
  shake), so a stream of them does not freeze the game; it counts in the hero's own parry rhythm
  (`chain`) but never recoils the wyrm and is not part of a string's `DEFLECT ×N`
  (`dragon:parried {bullet: true}`, no `onParried`).
- **One parry answers a clump.** A deflect opens a 0.3 s shield: small bullets that touch the hero
  in it pop, and so do the ones within 1.5 m of him or about to land within ~0.33 s.
- **Cut.** A light or heavy swing's active frames cut the small bullets within 0.45 m of the blade
  (`Player.isSwinging()`, the sweep segment). **Roll.** Rolling through a small bullet is a plain
  dodge (`hit.perfect === false`: no Ghostep, no slow-mo); the bullet flies on. An orb or a tongue can
  be perfect-dodged like any red blow (slow-mo in place; bullets never start the plunge).
- **The cue (the fairness rule).** Every bullet that is going to hit announces itself `flashLead`
  (0.35 s) before impact: a glint on the bullet and a paired `combat:tell` + `combat:flash`
  `{hazard: true, bullet: true}` (a ping, no music dip). Impacts within 0.3 s of an announced one ride
  on that cue. A bullet that could only be announced later than 0.24 s before impact fizzles on
  touch when it is younger than 0.6 s (spawned point-blank); an older one hits (the hero ran into
  it). **Two answers never land together:** an impact within `clashSep` 0.35 s of an announced one of
  the other answer (an ember beside an orb) is a dud and sends no cue; the torrent opens a gap in its
  stream so no ember reaches the hero within `orbSep` 0.4 s of its orbs. A pattern's opening flash
  follows its lead bullet even when the wyrm has already finished the move. **Tongues** are announced
  the same way (the time until any tongue, burning or still to come, next reaches the hero on his
  sensed velocity), and a tongue only hurts a hero it announced (within 0.75 s); after a tongue hit the
  tongues pause 1 s (0.5 s after a roll through one).
- **No melting.** After a bullet hit every touching bullet fizzles for 0.45 s, and each pattern has
  a hit cap (below). The field is cleared on a phase change, the wyrm's death and a reset, and
  fizzles when its posture breaks.
- Bullet and tongue damage is final: it is **not** scaled by `TUNING.damageScale`.

| Pattern (phase ≥) | Tell | P1 timing (s) | What flies | Hit cap | Weight [P1, P2, P3] / cooldown | AI gate |
|---|---|---|---|---|---|---|
| Ember torrent `emberStorm` (1) | N | windup 1.1 · cast [3.6, 4.2, 4.8] · recovery 1.0 | plants its feet and sweeps its head ±[0.75, 0.85, 0.95] rad across your bearing at [0.32, 0.37, 0.42] sweeps / s (the neck does it; the centre follows you at 0.6 rad/s), breathing an ember every 0.06 s per lane (9 m/s) in [1, 2, 3] lanes 0.22 rad apart: a living stream in gusts (1.7 a second, a quarter of each a gap) that crosses you once per half-sweep (parry the crossing or walk with the wave); P2+ at each sweep extreme the head snaps round and coughs [–, 3, 4] red orbs at you (6.5 m/s); P2+ it ends in [–, 2, 3] **barks** 0.42 s apart, cones of [7, 7, 9] embers at 11 m/s (parry each), P3's last bark 5 red orbs (roll) | 6 | [0.5, 2.0, 2.8] / 10 | ≤ 26 m |
| Cinder burst `fanVolley` (1) | N | windup 1.0 · [4, 6, 7] coughs 0.55 apart · recovery 0.9 | the head snaps onto you and coughs cones of [9, 11, 13] embers over ±0.55 rad at 10.5 m/s; the first has an ember dead on you, every second puts you in a gap (wider than you only from ~14 m off the jaws); P2+ the last cough is [–, 6, 7] red orbs (8 m/s); P3 every other cough is a double tap (a second cone 0.14 s later, half a spacing over: one parry's shield answers both), and 35 % of P3 bursts run straight into an Ember torrent | 5 | [2.4, 2.8, 3.2] / 6.5 | 5–30 m |
| Cinder spit `cinderSpit` (1) | N | windup 0.36 · cast 0.14 · recovery 0.22 (0.72 s in all) | a quick snap between other moves (many moves link into it): the head flicks onto you and spits [2, 3, 3] fast embers 0.09 rad apart at 15 m/s, one dead on you; P3 a second spit 0.12 s later, half a spacing over (one parry answers both). Parry, block or roll | 1 | [1.6, 1.6, 1.8] / 3.2 | 3.5–28 m, you ≤ 1.1 rad off its facing |
| Ember rain `emberRain` (2) | N | windup 0.9 · [3, 3, 4] volleys [0.6, 0.55, 0.5] apart · recovery 0.8 | it rears and coughs embers high into the air; each volley rains one on the spot you stood on and a ring of [6, 6, 8] round it 2.6 m out (P3 a second ring of 6 at 4.8 m), [1.1, 1.1, 0.95] s from the jaws to the ground, each spot glowing as it falls; in P3 the centre one lands 0.35 s ahead along your run. Keep moving (they land where you WERE), or parry the one that falls on you | 3 | [0, 1.6, 2.2] / 9 | 6–24 m |
| Scouring breath `fireWheel` (2) | R | windup 1.3 (the strike point heats) · [2, 2, 3] rakes of [1.5, 1.45, 1.3] s with a 0.35 s stop between · recovery 1.1 | braced on all fours, the neck rakes a sustained breath through 1.6 rad (about 90°) across your bearing; where it strikes the ground (2 m ahead of the jaws) it drives **tongues** out along it: [7, 7, 9] per rake evenly over the arc (the middle one runs over you), each a front crawling out at 13 m/s to 26 m, 1.2 m wide, every spot it passed burning [1.5, 1.5, 1.8] s. The rake back lays its tongues in the gaps of the first. In the first rake of phase 2 you can stand between two (0.27 rad apart: ~3 m at 12 m) until the rake back fills the gap; else roll through a tongue. Closer than ~7 m to its neck no tongue starts; past 26 m none reaches. 20 + burn 1.5, kb 4 | 3 | [0, 0.7, 0.6] / 14 | 9–24 m |
| Fire lanes `fireLanes` (3) | R | windup 1.0 · [3, 3, 4] strikes [0.95, 0.95, 0.85] s apart · recovery 1.0 | the head drives the breath into the ground at its feet again and again; each strike splits into 5 wedges 0.3 rad apart round your bearing, a lit wedge a band of 4 tongues (12 m/s, to 24 m, burning 0.85 s). Each strike lights a different set (the outer pair and the middle, the two between, the outer pair, the middle three): step into a dark wedge (~3 m wide at 12 m) before the fire reaches you, or roll through. 18 + burn 1.2, kb 3 | 2 | [0, 0, 0.8] / 13 | 8–22 m |

A string hit may scatter embers where it lands (`burst`: the Cinder flurry's overhead, the Sky hammer's,
the Furnace maw's and the Cataclysm's wing slams, the Cinder rake's overhead): they rise out of a puff
of flame and drop on the hero one by one (0.5 – 0.55 s after the slam, 0.26 – 0.34 s apart, 11 – 12
m/s): the string ends on more parries, not on a free punish.

Checked by `npm test` → BULLETS: every answer above per bullet kind, the perfect parry (RMB 0.05 s
before impact returns the shot for its damage and posture; 0.17 s is a plain deflect; an orb is
never parried; a return cannot push the wyrm past a phase gate; in a transition roar it deals what
a sword hit deals), the cue's lead, the clump rule, the grace, the hit caps, the point-blank dud,
the clears, and each pattern in each phase it runs in (every bullet born at the jaws along the
head's aim; a standing hero is hit at most `maxHits` times; a hero who answers the cues takes fewer
hits than one who stands still; the body never turns faster than its walking turn rate); the
even-count burst's centring at range and the P3 burst → torrent chain. TONGUES: a hero standing in the
Scouring breath or the Fire lanes is hit; between two first-rake tongues at 12 m he is not hit before
the rake back; in the dark wedge of a strike he is not hit before the next strike.

**Difficulty of the patterns** (scripted heroes, 2026-11-11; hits taken, standing / answering every
cue, before → after the Hard breath patterns; measured before the second pass: the torrent's barks,
the Scouring breath's tongues and the three new patterns are not in it, and the Wisp swarm's row went
with the swarm):

| Pattern | P1 | P2 | P3 |
|---|---|---|---|
| Ember storm → torrent | 2 / 1 → 4 / 0 | 4 / 1 → 6 / 0 | 4 / 2 → 6 / 0 |
| Cinder fan → burst | 2 / 1 → 4 / 1 | 3 / 1 → 5 / 1 | 3 / 1 → 5 / 1 |
| Fire wheel → Scouring breath | – | 2 / 0 → 1 / 0 | 2 / 0 → 1 / 0 |
| Meteor rain → Armageddon | – | 3 (P1 values) → 5 / 0 | – → 5 / 0 (+ 31 crater ticks) |

A standing hero took the full cap in almost every pattern; the cue-answering bot (it parries 0.12 s
before impact and rolls 0.1 s before a red one, in a frame) came through nearly clean, so the patterns
stayed fair to perfect reads. Whether a person can read a P3 torrent with orbs is not something a bot
shows: a human playtest is owed.

## The Ash Disciple (2026-11-12, ADR-060 – ADR-063; the second pass: 2026-11-16, ADR-122; `?level=ash`)
A duelist at **PBZ-boss speed** (owner, 2026-11-12): a move's first hit winds up 0.42–0.6 s (red
0.52–0.7 s), a string's later hits wind up 0.30–0.37 s, every strike a ~0.1 s snap out of its cock. The
tell rules hold at that speed: every hit cued by its flash `flashLead` 0.3 s before impact, a move's
first windup ≥ 0.42 s in every phase, a string's impacts ≥ 0.32 s apart (so each flash comes after
the hit before it); a red or black blow shows nothing before its flare (no ground ring, no body glow:
ADR-118; until then red hits glowed and red areas ringed the ground); the deflect chain (a move's
non-final hit is deflected, its last recoils him). How he keeps the pressure on, and what the
player can rely on through it: *The duelists' pressure and the fairness guard*, below. His own:
- **His guard** (ADR-080) covers ±75° of his facing: in footwork (0.18 s after a move, a stagger or
  a recoil ends; at once after a ward or a flinch), through a ward, through the first 55 % of each
  windup (after that he has committed: the strike can be traded), and in the **late half of a move's
  recovery** (the first half is the punish window; after it he breaks the recovery off into his
  guard). A strike into it deals nothing and adds guard posture (light 8, heavy 20). It is read from
  him, in three steps:
  - **Raised.** As the hero swings at him from his front (within 4.4 m) the blade leaves the
    en-garde line and stands across his body, the free palm behind the flat: up in ~0.07 s, before
    the strike arrives, and kept up 0.6 s after one was met. A raised blade means: this will be turned.
  - **GUARDED** (a ward). He meets the strike on the side it came from (left, right, or overhead for
    the finisher), is driven back 0.24 m (0.4 m by a heavy strike), dull steel sparks on the crossing
    of the blades, a dry clack, a 0.07 s freeze (0.11 s heavy). The hero's chain goes on: each
    guarded strike wears his posture, and each one in a row (within 2.5 s) makes the next likelier to be
  - **DEFLECTED** (0, 35, 70, 100 % on the 1st – 4th). He beats the strike away: a hot orange burst
    and two rings, a harsh falling clang, a flicker of the frame, a red call-out. The hero's blade is
    thrown back and he gives 0.9 m (**the bounce**, 0.42 s: a guard or a dodge cancels it at once, an
    attack only after 0.28 s), and the **Riposte** comes straight out of the 0.24 s beat: its first
    cut lands ~0.7 s after the deflect, cued as any other. Orange means: stop attacking, answer.
  A strike turned in his early windup is turned in passing (sparks, GUARDED; his own blow goes on).
  A heavy strike with posture ≥ 48 (the charged cleave from ~90 % charge; CLEAVE.poise 30–50)
  crushes the guard: it lands and he staggers (0.8 s).
- **He steps out of heavy blows:** a charge more than half way, the cleave in flight or the
  finisher's raise, within 6 m: once per 3 s, 45 % of the time (the Starless Lord 50 %), a sidestep
  out of a charge's line or a backstep from a blow already coming; from footwork, or breaking off the
  late half of a recovery.
- **Openings:** the first half of his recoveries (0.45–0.8 s in all); the recoil (1.0 s) after his last hit is parried; the
  flurry (a perfect dodge is answered with as many blows as the streak counts and leaves the hero
  1.5 m behind him; no plunge; his back is never guarded: *The streak and the flurry*); the
  reeling and trampled reactions of the moments below; the posture break.
- **Hit stun on him (ADR-063):** every blow that lands freezes the frame (light 0.065 s, heavy 0.1 s,
  a crit 0.12 s), snaps his chest and head back (a jolt layered on whatever he is doing) and shoves
  him 0.14 / 0.32 m along the blow. It never cancels a windup. In footwork a blow makes him flinch
  (after 2 within 1.6 s he backsteps); **in his recovery** a light blow makes him flinch and a heavy one
  staggers him.
- **Feints never glint:** a feint has no tell and no flash. Only real impacts are cued. (A blow the
  fairness guard turns into a feint is the same: no tell, no glint, no hit.)
- **Posture break → execution:** broken for 3.2 s on one knee (hits crit ×1.5); an attack within
  3.2 m runs him through: the execution thrust (a cinematic moment), 260 final damage, the break
  spent, he gives ground.
- **Three phases** (ADR-122; two until then): P1 100–64 %, P2 64–36 %, P3 36–0 % (each gate holds
  damage until its transition; the tuning pass moved them from 62 / 30 % so that phase 3, the
  busiest, gets the biggest share). Windups × [1, 0.92, 0.92], recoveries × [0.9, 0.8, 0.8]:
  **phase 3 is no faster than phase 2**; its ramp is in what he does. Two transitions, each a red
  ring blow (r 6 m, 10 damage, kb 6): **the Kindling** into phase 2 (he kneels, the blade kindles;
  1.75 s windup, 1.61 s as played) and **Ash on the Wind** into phase 3 (1.6 s, a knockdown). The
  phases: below.

### Three phases (2026-11-16, ADR-122)
The owner's ask for every boss: harder means more pressure, not more damage; each phase busier and
more chaotic than the last. No damage, health or posture number went up (the worst blow is still
Black Tide's 38 before `damageScale`); his pauses are shorter, his strings longer and they move, and
he mixes the blade, his feet, the qi and the courtyard.
- **Phase 1, the fencer** (100–64 %): the blade and the feet. Strings that move (a glide in, a cut, a
  kick, a thrust: Drifting Cloud; a leap into a travelling spin: Crane Descends; a spin that carries
  him round: Whirling Step), feints (Two Shadows: a feint from one side, the real overhead from the
  other), the nine-hit Chasing Rain, and sword qi thrown as a string's last word (Chasing Rain,
  Parting Wind). Footwork between moves 0.1–0.3 s, the flow roll 0.6, at most 4 moves in a row.
- **Phase 2, the kindled blade** (64–36 %): what his blade cuts burns. Big cuts leave **burning
  ground** (below), the qi comes in fans (Ember Fan: 3, 2, 3 crescents), a zig-zag of glides lays a
  path of fire (Zig-Zag Embers), Heaven-Splitting Fall lands in a ring of fire, the courtyard's wood
  catches. The hero has to move off the ground he just defended. Footwork 0.06–0.2 s, flow 0.72, 5 in
  a row.
- **Phase 3, ash on the wind** (36–0 %): he comes apart into ash between blows and strikes from
  another side (`flit` inside his strings: Scattered Petals, Ash Lotus, Ash Shadows, Ten Thousand
  Ashes), every blade beat leaves a faint afterimage, the longest flurry of the fight (Ten Thousand
  Ashes, 11 hits), the **storm of qi** (Storm of Ash: three waves of crescents, 3, 2, 3, then one blue
  one; 6.5–16 m), and the courtyard's flagstones thrown in a fan. Footwork 0.03–0.12 s, flow 0.82, 7
  in a row. More blows from more places, not faster ones (the 0.42 s / 0.32 s floors hold).

**Every phase asks for dodges** (the tuning pass): a red blow sits inside eight strings (Drifting
Cloud's kick, Chasing Rain's glide, Whirling Step's second spin, Brand and Kick's kick, Cinder Cross's
burning cut, Falling Embers' second leap, the 4th blow of Scattered Petals and of Ten Thousand
Ashes), each 22 with a 0.52–0.56 s windup so a roll fits after the blow before it; the string's other
blows gave that damage back (no string's total went up). Before it 5 / 6 / 9 % of his cues asked for
a dodge and a parrying hero answered runs of up to 76 cues the same way.

**Burning ground** (from phase 2; `TUNING.burn`, `ashDisciple/moveFx.js`). A beat marked `burn`
leaves a line of fire on the stones where it cut: across his front (a level cut), along it (a
vertical cut or a thrust), the way he came (a glide), or a ring of arcs round where he lands
(Heaven-Splitting Fall). A line is 0.8 m wide and 3.4 m long and burns 3.2 s; at most 0 / 7 / 9 lines
alive per phase (one more puts the oldest out). **It is ground to step off, not a blow: it has no
cue.** It burns by the rule of fire on grass: 5 HP every 0.55 s to a hero standing in it after its
first 0.45 s, never while he rolls, and not until 0.35 s after the last blow of the string that laid
it (the hero defends where he stands, then moves). **Against a held guard it costs the guard meter,
never health** (the owner: "Guard meter, no health"): each tick is a blocked blow that drains 34 of
the meter (no shove); a full meter takes two ticks and the third knocks the guard open, about 1.6 s
into a line; from then on it burns him as an unguarded hero. Wood it touches catches
(`world.ignite`). Measured (a pure defender, 120 s a phase, three seeds): one who steps off the lines
loses 0 / 5 / 0 HP to fire in phase 2 and 0 / 15 / 5 in phase 3; one who holds his guard and stays on
them loses 10 / 5 / 10 in phase 2 and died on one seed in phase 3 (the fire opened his guard four
times and blades came in through the opening). Burning ground is alive 32 % of phase 2 and 20 % of
phase 3 (the final build, ten seeds). The wyrm's grass fire keeps its own rule (a blockable chip).

**Sword qi** (Ash Crescent, a string's last word, the fans, the storm): each crescent cues itself
0.3 s before it reaches the hero; one that would reach him sooner than `TUNING.crescent.minLead`
0.27 s after it is thrown is not thrown at all (it used to glint and fizzle on him). Ember Fan and
Storm of Ash are only picked from 6.5 m (closer, every wave arrived too soon to cue). **The qi that
ends Chasing Rain and Parting Wind is a cut at close range**: their last beat carries the diagonal
cut's zone (sector 2.15 m), and a `release` beat that carries a zone strikes as a cut when the hero
stands inside it as its cue comes due (decided once, then cued, held by the guard and answered as a
white blade blow; no qi is thrown), and throws its qi otherwise (until this pass it was thrown at
nothing when he was close: phase 1's longest gap, about 1.5 s with no cue). **Still open:** between
about 2.6 m and 4.85 m the qi is not thrown (too close to cue) and the cut does not reach; a trade
clash cannot meet that cut; the phase-3 afterimage skips it.

### He uses the courtyard (2026-11-15, ADR-111; the floor, the colossi and thrown pieces: 2026-11-16, ADR-122)
Seven moves on the pieces of the set (*The world breaks*, below). His AI picks one only while a piece
for it is in reach; with none, the move is simply not there. Each piece is spent for the fight (the
bell aside), so they thin out as the duel goes on; the reset puts every piece back. To reach a piece
he may leave his bound (12.5 m) by up to 9.5 m for the length of the move; after it the bound draws
him back in at 5 m/s. Numbers: `ashDisciple/tuning.js` `TUNING.terrain`; code: `ashDisciple/terrain.js`.

**A thrown piece shows the flare only** (the owner, ADR-122; this supersedes ADR-111's landing marks
for thrown pieces, as ADR-119 did for the wyrm's): a kicked lantern or flagstone draws NOTHING on the
ground where it will land; its flare is drawn on the flying piece 0.3 s before it lands (blue, with
`flare: true`: the HUD's blue edge glow and the parry ping), and a roll at the flare always dodges it.
Pieces that topple (a cut pillar, a colossus) keep their ground strip: that fall is the world's. A
thrown piece the fairness guard cannot clear (a cue of the other answer too near its landing, even
with its flight lengthened by up to 0.4 s) lands uncued and harmless, and one a world warning would
land on is grounded in the air (quietly: no blow).

| Move (from phase) | Tell | What happens | What it asks |
|---|---|---|---|
| **Severed Pillar** `pillarFall` (1) | white (his cut), then **red** (the piece, the world's) | He crosses to behind the standing piece you are under (a pillar, the stele, or a **colossus's upper half**: 2.3 m or taller, you within its height + 0.5 m, he within 14 m of it) and cuts it through: windup 0.66 s (0.61 from phase 2), glint 0.3 s before the cut. It falls on you in 0.7 – 1.0 s (0.95 s for a 4.5 m pillar; a colossus 1.4 s, its strip starting 1.6 m out from its plinth): the strip is marked from the moment it goes, its flash comes 0.3 s before it lands, 22 x its weight (0.6 – 1.3: at most 28.6), unblockable, knocked down. | Be out of the strip (a walk does it), or roll as it lands. His cut (18) only reaches a hero who hugs the pillar: parry it. |
| **Flying Lantern** `lanternKick` (1) | **blue**, the flare on the piece | He is at a stone lantern, or a pillar's stump 0.9 – 2.3 m tall (within 13 m of him, you 4.5 – 26 m from it), and kicks it at where you will be 0.2 s on: windup 0.64 s, 0.62 – 0.95 s in the air. Nothing marks where it comes down; the flare pops on the piece 0.3 s before it lands. 22, knockback 2.4, within 1.5 m of the landing. | Parry at the flare: it bursts on the blade and costs him 14 posture. Or roll at the flare, or keep moving. |
| **Three Tolls** `bellToll` (1) | white, white, **blue**, each cued on its ring | He leaps to the fallen bell (within 15 m of him, you 3.2 – 23 m from it: never with you beside it, where the rings pass before they can cue) and strikes it three times, 0.6 – 0.7 s apart. Each blow sends a ring of sound out at 12 m/s (it dies 26 m out); its glint pops on the ring 0.3 s before the front reaches you (your own run toward it counted in). 12, 12, 18. Sound is not stopped by cover. | Parry the three in rhythm (10 posture each), or roll through each (across their way: rolling toward the bell brings the next one sooner than a roll can follow a roll). |
| **Swallow's Return** `swallowReturn` (1) | **blue** flare | His way out when pressed (2.4 x as likely with his posture over 40 % or a blow landed in the last 2.2 s). From close (within 5.5 m), with a pillar 3.2 m or taller within 10.5 m behind him: he leaps back onto it (0.42 s), is on the stone for 0.13 s, and dives off it at you: windup 0.92 s in all (0.85 from phase 2), the glint as he leaves the stone, 0.3 s before the cut. 24; the dive follows you for its first half and covers up to 12.5 m. His feet chip the pillar (0.3): a worn one gives way. | Parry the dive (a perfect parry locks the blades), or step aside once he has left the stone. |
| **Rising Flagstone** `flagKick` (1) | **blue**, the flare on the slab | The floor (new): with a whole slab within 2.2 m of a point 1.5 m in front of him toward you (you 3.5 – 14 m from him), his blade levers it up out of the paving (0.8 m in 0.16 s) and he kicks it at where you will be 0.15 s on: windup 0.6 s (0.55 from phase 2), 0.45 – 0.85 s in the air. 18, within 1.2 m of the landing; it bursts on what is there and leaves flat shards. | As the lantern: parry at the flare (12 posture to him), roll at it, or keep moving. |
| **Flagstone Volley** `flagVolley` (2) | blue, blue, blue | Rising Flagstone three times, one slab a beat (16, 16, 18; windups 0.55 / 0.44 / 0.44 s as played). | Parry each at its flare, or keep moving across their line. |
| **Scattered Flagstones** `flagFan` (3) | **blue**, a flare on each slab | Three slabs (two at least) levered up at once, gathered into a row 1.6 m in front of him and cut through in the air: they leave as a fan, the middle one at you, the others 0.42 rad to either side, 0.5 – 0.9 s in the air. 16. | Parry the one that comes for you at its flare, or step out of its line; the other two land beside you. |

Cooldowns 9 / 10 / 14 / 8 / 9 / 11 / 10 s; none is a counter. Weights per phase: the moves table
below. After a thrown piece he follows with a string or a gap closer that lands AFTER the piece, not
with it (`links.js` `THROWN`, the pursuits with `cut: 1`); after the bell, the pillar or the spring
with a string (`YARD`). In a 150 s duel against the fencing bot on the real courtyard (`duel.mjs`
TERRAIN, before this pass) he made 31 moves, 7 of them these: 23 %. Checked by
`tests/integration/duel.mjs` TERRAIN (on the real set: each tell and timing, the piece used and where
it ends, nothing drawn where a thrown piece lands, the hero hit only where a falling piece is marked,
the answer each tell promises, no move without a piece in reach, the floor moves come up in a duel
(at least 5 over three seeds), the reset) and WORLDCUE (a world warning grounds his thrown pieces).
**Not measured:** what they do to the fight's difficulty for a human, and the frame rate on a phone
with three rings on screen. **Not filmed after the last tuning commit:** the thrown pieces' `cut: 1`
pursuits.

### Pressure: how he closes (ADR-063)
(owner: "it shouldn't be attacking if it's not near the player or able to hit them ... it should
sprint and catch up ... instead of the player able to kite it out easily")
- **Striking range only.** He circles (guard up, 2.2 m/s) only inside 1.8–3.2 m, for a breather of
  `idleGap` P1 0.1–0.3 s / P2 0.06–0.2 s / P3 0.03–0.12 s (after an opening of the hero's: the old
  0.12–0.38 / 0.08–0.26 / 0.08–0.26 s, `openingGap`); beyond it he runs (5.6 m/s), beyond 5.5 m he **sprints at
  8.6 m/s** (the hero sprints at 7.2). Each move's AI band is the distance it can really reach from.
- **The step-in:** through every windup he steps toward the hero (a move's first hit up to 3 m, later
  hits 1.4 m, at most 12 m/s) so the blow arrives where its zone reaches him; the step, the track and
  every dash **lead** a moving hero (aimed at where he will be at the impact, from his velocity), so a
  running hero is met, not chased. A cut is never thrown at air.
- **Strings stop:** if the hero is out of reach of a string's next hit (a long roll, a Ghostep
  elsewhere) the string ends there and he goes after him (a sprint, or a move that reaches).
- **Links and flow** (ADR-122): a move that ends on its own may go straight into another, from
  half way through its recovery: first its own combo links (`links.js`, by where the hero is as it
  ends), else the flow roll, [0.6, 0.72, 0.82] per phase (it was 0.45 / 0.6); at most 4 / 5 / 7 moves
  in a row, then a breather of 0.45–0.75 / 0.25–0.45 / 0.15–0.35 s. *The duelists' pressure and the
  fairness guard*, below. **His links** (`ashDisciple/links.js`; the first entry whose `when` holds,
  whose roll passes and whose target is usable wins): every string shares one pursuit list (far: a
  glide in, a crescent or a fan, a kicked flagstone; away: Drifting Cloud, Piercing Ash, from phase 3
  Ash Shadows; mid: a leap string or a thrust; behind or at his side: a spin or Ash Lotus) and adds
  its own close follow-ups (near: another string, Two Shadows, Lotus Sweep; from phase 2 the burning
  strings; from phase 3 Scattered Petals and Ten Thousand Ashes); a single blow the hero guarded
  links into a long string (`guarding`: Chasing Rain, Two Shadows, Hundred Petals, Cinder Cross, Ten
  Thousand Ashes). Chances 0.2–0.6, rising with the phase.
- **A flask is punished:** while the hero drinks there is no breather, the moves that cover ground
  (a dash ≥ 3 m, the leap, the qi) weigh ×4, and he sprints in from any distance.
- He sometimes backsteps (30 %) when the hero is closer than 1.1 m, and sidesteps a charge
  held against him (45 %, once per 3 s).

### The duel's moments (ADR-062)
Sekiro / Phantom Blade Zero beats, each read from his data (`moves.js` beat flags, `tuning.js`):
- **Full deflect** — parry every hit of a string of ≥ 5 (Rain of Ashes 7, Thousand Needles 5, and
  of the second pass's strings those whose every blow can be parried) and the last parry throws him
  off balance: "PERFECT DEFLECT", `dragon:deflected`, posture +70, he **reels** (1.45 s, wide open)
  and the moment plays in slow motion. (Hundred Petals and Ten Thousand Ashes end on a perilous
  thrust, so their climax is the mikiri instead; a string with a red blow inside cannot be fully
  deflected.)
- **Blade lock** — a **perfect** parry (≤ `perfectParryWindow` 0.08 s before the impact) of a blow
  marked `lock` (every `lock` in the moves table below: Falling Ash, Falling Star, Crane Spins' leaping
  chop, the overhead cut in Rain of Ashes and Hundred Petals, and a blue blow in most of the new
  strings) crosses the blades: "BLADE LOCK", the camera closes in (7 m, no slow
  motion), a prompt `MASH [LMB]  [#####-----]` (touch: TAP ATTACK). Each press of attack or guard
  pushes +0.085; he pushes back 0.32 / s (P2 and P3 0.38). Full = won, empty = lost; when 2.6 s run out the
  hero wins at ≥ 0.6. About 1.5 s at 8 presses a second; 5 a second just holds it to the end; none
  loses in ~1.5 s. **Won:** "BREAKTHROUGH", posture +110, he reels, the hero gets the crit window
  (1.6 s) and 0.3 s of i-frames, slow motion. **Lost:** he shoves the hero (14, kb 2.6, unblockable)
  and comes straight in with the Riposte. The hero can't be hit while locked.
  The picture (ADR-081): the two close to 1.3 m (each steps half the way), both hands on the grips,
  the blades crossed between their heads (the hero's grip follows the crossing: 1 – 12 cm between
  the blades in the tests), leaning in, arms shaking; sparks grind out of the crossing, every press
  spits a few more and shoves the pair 8 cm toward him (0.9 m over the whole meter; they slide back
  onto the hero as he loses); the blades break apart in gold (won) or orange (lost).
- **Trade clash** (ADR-082) — no button: two cuts at the same moment. A blade's blow (normal or
  blue; not a red one, not a thrown thing) that arrives while the hero's own cut is in the air (its
  active frames, 0.03 s before to 0.02 s after), or a cut of the hero's that connects when his blow
  is at most 0.1 s from landing, **meets it**: "CLASH", neither is hurt, a white-hot burst and two
  rings on the crossing, a 0.12 s freeze, two steels ringing. In press terms: an attack press
  0.08 – 0.27 s before his blow lands (a window as wide as the parry's 0.22 s).
  - The hero's blade is thrown back (the bounce: a guard or a dodge at once, an attack after 0.28 s)
    and he gives 0.55 m. His posture takes guard × 1.5 (12 / 30 for a light / heavy cut): more than a
    guarded strike, less than a parry (26 / 48).
  - **A string goes on** (his blade rebounds as from a deflect), and **two blows in a row cannot be
    traded**: after one, the next needs 0.6 s (blows come ~0.4 s apart), so the blow that follows
    must be guarded or dodged. Mashing attack trades one blow and takes the next.
  - A single strike, or a string's last blow, traded: he is thrown back 0.5 m into his guard (0.26
    s). **No punish window**: only a parry earns the recoil.
  - **A full cleave wins it:** a charge whose posture reaches the guard's crush (48) is not thrown
    back: it beats his blow aside, staggers him and lands.
  - A cut that bit him more than 0.1 s before his blow lands is not a clash: both blows land, as before.
  - **The flash counter** (ADR-102, `DEFENSE.counter`): his blow arrives when the hero's cut has only
    just become a cut (at most 0.03 s into its active frames: an attack press about 0.08 – 0.14 s
    before his blow lands; any later and it lands on the hero). The cut is **not** thrown back: it
    beats his blow aside and goes through him. 70 damage (final, past any guard) and 60 posture at
    once, he **reels** (1.45 s, wide open: his string is over, a cinematic moment), the crit window
    (2.2 s) opens, a gold burst, a 0.16 s freeze, "FLASH COUNTER" (`player:counter`). The swing
    itself lands nothing more. Only in the half the hero's press decides (his blow arriving in the
    cut); a cut that connects before his blow is the plain clash.
- **Mikiri (perilous thrust)** — a red thrust marked `mikiri` (Piercing Ash; the last hit of Hundred
  Petals) flashes `combat:flash` with `perilous: true`. A roll **into** it (the roll's direction
  against his facing, dot ≥ 0.55) whose impact comes within 0.3 s of the roll's start steps on the
  blade: "MIKIRI", `player:mikiri`, 0.55 s of i-frames, the crit window, posture +130, he is
  **trampled** (1.5 s, pinned), slow motion. A roll across or away is an ordinary dodge.
- **The cinematic** (`flow.cinematic`) — the full deflect, a won lock, the mikiri and the execution:
  time × 0.28 for 0.9 real s, easing back over the last third (the flow's own time scale, so an
  actor's short hitstop is not stretched over it), the camera 10 m closer, leaning 60 % toward the
  clash, a deep gong. A newer moment replaces a running one.

### Impact: the parry and the hit (ADR-063; the clash: ADR-079)
For every blade the hero meets (the wyrm's too; bullets keep their light clash):
- **The blades meet** (a duelist's blow). At the frame a blow "lands" its blade is already through
  the hero, or past him (a cut travels ~0.4 m a frame). So he is shown **held where his blade met
  the guard**: the pose is stepped back along the strike (≤ 0.06 s of clip time) to the last one
  before it crossed the hero in which the steel is still 0.34 m clear of him; a thrust down the
  centre line is set 0.4 m aside. The hero's deflect is taken **on that side**, raised into an
  overhead ward for a blow from above or hung point-down for a cut at the waist, posed in the same
  frame, and the grip nudged until the blades touch: in the tests 7 of 10 parried blows of two
  strings end with the blades ≤ 0.2 m apart (most ≤ 0.1 m; a thrust set aside stays ~0.4 m off).
  The clash is drawn once, on that crossing. A blow that is only deflected then **rebounds** off the
  guard (0.07 s) before the string goes on; the timeline, the tells and the hits are untouched.
- **The clash** (`combat/clashFx.js`): a starburst of thin streaks in the screen's plane, most of
  them thrown on the way the turned blade was going; a cross of light along the two edges; a small
  core gone in two frames; embers that fall; a thin ring where the exchange turns. White-gold, cold
  blue for a heavy blow, gold for a perfect parry. No big bright glyph: until 2026-11-14 the
  freeze-frame showed two white blots where the blades should cross.
- **A parry** freezes the frame at ×0.02: **0.05 – 0.075 s inside a string**, 0.095 s for a blue
  blow, **0.11 s on a string's last blow** (the one that recoils him) or a single strike, 0.14 s for
  a perfect parry. (It was 0.1 / 0.12 / 0.15 s on every blow: 0.7 s of standstill in a seven-cut
  string.) The fighters hold the contact; **the sparks fly on** (`game.fxDt`: particles and lights
  run at 0.6 of real time through a freeze). The camera **punches in** 1.5 – 3.6 m and springs back,
  kicks (0.3–0.5), and the frame flickers white (`grade.flashPulse`: 0.12 inside a string, 0.22 on
  its last blow, blue 0.3, perfect 0.55) under a heavier clang (a deep body, a low ring). A riposte
  may start 0.07 s into the parry (was 0.12).
- **A perfect parry** adds a beat of slow motion (× 0.35 for 0.36 real s, the camera 2.5 m closer:
  `game:cinematic` 'perfectParry', no gong), a gold burst and two rings, and a bright bell.
- **Duel framing:** within 6.5 m of a duelist the camera sits 6 m closer (30 m, not 36; gone 4 m
  further out; scaled for the phone's closer camera), so the blades read; the punches start there.
- **A blow that lands on the hero** freezes the frame (0.085 s; a big one 0.13 s) with a heavier
  shake (0.3–0.6) on top of the hurt flash and the stagger.
- **His blade** leaves a sweep trail through every strike, from the snap out of the cock through the
  follow-through: a crescent of strokes laid along each blade point's path, pale steel (ember from P2).
- **His edge bites** (a landed, unguarded hit of a swing: `atk.hitAt`): through the freeze the blade
  holds where it bit, the grip pulls in along it, the hips drop ~4.5 cm, the chest folds into the
  blow and the head nods; then the blade tears on through over 0.08 s of the swing's clock (it is
  never pulled back past the frame that hit). Per weight (combat.js `bite`): the lights 1, the
  sprint slash 1.1, the slam 1.3, the cleave 1.5 (its hips drop ~7 cm, but its chest does not fold
  and its head does not nod: the two-handed blade stands upright before his face, and a close
  contact held it 2.5 cm into his head through the longest freeze; swings.js `fold` 0); a guarded
  strike never bites.
- **A cut that lands** (the hero's, on any boss; 2026-11-14): drawn where the drawn blade meets the
  drawn body (`player._contactPoint`; STYLE.md "A cut that lands"). Its weight is per attack
  (`combat.js` data, crit factors in `HIT_FEEL`):

  | Attack | contact | freeze (s) | shake | punch (m) | kick (m) |
  |---|---|---|---|---|---|
  | falling cut, backhand | light | 0.055 | 0.12 | 0.35 | 0.08 |
  | whirl | sweep | 0.065 | 0.16 | 0.45 | 0.10 |
  | lunge (stab) | point | 0.07 | 0.14 | 0.6 | 0.10 |
  | slam | slam | 0.12 | 0.42 | 1.6 | 0.20 |
  | sprint slash | sweep | 0.07 | 0.2 | 0.5 | 0.10 |
  | roll cut | light | 0.06 | 0.14 | 0.4 | 0.08 |
  | cleave | cleave | 0.15 x (1 + 0.3 x charge) | 0.45 | 1.2 - 2.0 | 0.14 - 0.24 |
  | the execution | execute | 0.16 | 0.5 | 2.0 | 0.24 |

  A crit: the freeze x1.4, the shake x1.3, the punch + 0.6, the kick x1.35. Against a duelist his
  own hit stun (0.065 s for a light) is the longer freeze, so the lights' retune shows on the wyrm.
  The **kick** throws the picture along the blade's travel on screen (a light about one 4 px cell at
  36 m, the full cleave about 12 px) and springs back in ~0.25 s with one small overshoot, in real
  time. Every landed cut **punches** (the lights too). The blade **flares** (x1.62 on a light's
  contact frame, x1.95 heavy), held through the freeze. The **sound** is the body's hit (scales, or
  cloth on a duelist) under the blade's own `cut` layer (a slice and a ring per weight, a semitone up
  each hit of the chain); a guarded strike plays only its clash. The pad rumbles on every landed
  cut. A struck duelist **shudders** through the freeze (drawn only; a sword cut's only). His shove
  is instant, so the cut and his spray move with him: they sit on the body the freeze holds. A slam
  that lands only through its ground shards draws no cut: no flare, no `cut` layer (the body's hit
  only). A strike his guard turns gets none of it: the guard draws its own clash.

**Moves** (`moves.js`, ADR-122; generated from the data by the tuning pass's `gen-moves.mjs` on
2026-11-16; `node tests/integration/duel.mjs . moves` checks every new one). Tells N normal, B blue
(`B*` a parry moment: the blue flare, a parry ends the move and the hero counters), R red (the
flare: dodge), K black (charged: dodge). A hit: `tell windup(+bait hold) (damage) zone motion`;
zones `s` sector / `l` line / `r` ring (radius m), `qi` sword qi (`qi xN` crescents); motion `dash`
(m at most), `leap`, `travel`; `lock` a perfect parry locks the blades, `mikiri` perilous, `kd`
knockdown, `burn:` leaves a line of fire (phase 2 on: across, along, path, ring), `zig` the glide
steps aside first, `flit` he comes apart into ash and strikes from another side, `go` / `spring` /
`cast:` a move of the courtyard. **Windups as played in phases 2 and 3** (× 0.92; phase 1: ÷ 0.92),
recoveries at phase 3's × 0.8. Damage before `damageScale` 1.15. Cat = the director's category.

| Move (from phase) | Hits (tell windup (damage) zone, motion) | Recovery | Cat · band m · weight [P1, P2, P3] · cooldown s |
|---|---|---|---|
| **Plum Thrust** `plumThrust` (1) | N 0.46 (18) l1.9 dash 4.8 | 0.40 | closer · 2.6–6.8 · [1.4, 0.9, 0.3] · 2.5 |
| **Falling Ash** `fallingAsh` (1) | B* 0.55 (26) s2.3 lock | 0.44 | single · 0–3.8 · [1.2, 0.8, 0.3] · 3 |
| **Falling Star** `fallingStar` (1) | B* 0.46 (24) s2.3 leap lock | 0.40 | single · 0–4.2 · [1.6, 1, 0.4] · 3 |
| **Piercing Ash** `piercingAsh` (1) | R 0.63 (30) l2.1 dash 6.5 mikiri | 0.48 | closer · 3–9 · [1.2, 1, 0.4] · 5 |
| **Rain of Ashes** `ashRain` (1) | N 0.42 (14) s2.15 · N 0.31 (13) s2.15 · N 0.31 (13) s2.2 · B 0.37+0.10 (20) s2.3 lock · N 0.33 (12) s2.15 · N 0.31 (12) s2.2 · B 0.37 (20) l2 dash 2.2 | 0.56 | string · 0–3.6 · [2.4, 2, 1.6] · 7 |
| **Swallow Flicks** `swallow` (1) | N 0.42 (14) s2.15 · N 0.31 (14) s2.15 · B* 0.37 (20) l2 dash 2.2 | 0.48 | string · 0–3.8 · [2.6, 2, 1.6] · 3.5 |
| **Crane Spins** `crane` (1) | N 0.46 (15) r2.2 · N 0.33 (15) r2.2 · B* 0.42 (24) s2.4 dash 3 leap lock | 0.52 | string · 0–3.6 · [2, 1.6, 1] · 5 |
| **Hesitating Blade** `hesitate` (1) | feint 0.37 · B 0.39+0.20 (22) l2 dash 2.8 · N 0.31 (14) s2.15 | 0.48 | single · 0–4.6 · [1, 0.9, 0.15] · 5 |
| **Lotus Sweep** `lotus` (1) | R 0.57 (22) r3 kd | 0.48 | area · 0–3.4 · [1, 0.8, 0.3] · 6 |
| **Wind Step** `windStep` (1) | N 0.52 (18) s2.2 dash 10.5 | 0.40 | closer · 4.6–13 · [2.6, 2.2, 1.8] · 3 |
| **Ash Crescent** `ashCrescent` (1) | N 0.46 (14) qi qi x3 | 0.40 | ranged · 6–16 · [1, 0.8, 0.3] · 5 |
| **Severing Wind** `severingWind` (1) | B* 0.59 (26) s2.3 dash 8.5 lock | 0.48 | closer · 3.6–10 · [1.6, 1, 0.4] · 6 |
| **Twin Embers** `twinEmbers` (1) | R 0.61 (22) s2.3 dash 6.5 · R 0.64 (24) r3 kd | 0.52 | closer · 2.4–8 · [1.3, 1.5, 0.8] · 8 |
| **Black Tide** `blackTide` (1) | K 1.45+0.10 (38) s2.8 dash 7.5 kd | 0.64 | closer · 2.4–9 · [1.1, 0.8, 0.6] · 12 |
| **Drifting Cloud** `glideKick` (1) | N 0.52 (10) s2.2 dash 5.2 · N 0.33 (11) s2.15 · R 0.52 (22) s1.9 · B 0.42 (18) l2 dash 3.4 | 0.48 | string · 2.4–7.5 · [2.4, 2, 1] · 6 |
| **Crane Descends** `leapSpin` (1) | N 0.48 (15) s2.3 dash 5 leap · N 0.37 (14) r2.2 travel · B* 0.39 (20) l2 dash 2.2 | 0.48 | string · 2.8–7 · [2.2, 1.8, 0.7] · 7 |
| **Two Shadows** `mirrorFeint` (1) | feint 0.39 · B 0.42+0.08 (22) s2.2 lock · N 0.33 (13) s2.15 · N 0.31 (12) s2.15 | 0.48 | string · 0–4 · [1.8, 1.6, 1.4] · 6 |
| **Chasing Rain** `chaseRain` (1) | N 0.42 (11) s2.15 · N 0.31 (11) s2.15 · N 0.31 (11) s2.2 · N 0.35 (11) l2 dash 2.2 · R 0.52 (22) s2.2 dash 5.5 · N 0.33 (11) s2.15 · N 0.31 (11) s2.2 · B 0.39+0.08 (20) s2.3 lock · N 0.39 (13) qi qi x3 | 0.56 | string · 0–3.8 · [1.6, 1.5, 1.4] · 12 |
| **Whirling Step** `windSpin` (1) | N 0.46 (11) r2.2 travel · R 0.52 (22) r2.2 travel · B* 0.39 (18) s2.15 lock | 0.48 | string · 0–4.2 · [2, 1.8, 0.8] · 7 |
| **Parting Wind** `partingWind` (1) | N 0.42 (13) s2.15 · N 0.31 (12) s2.2 · N 0.33 (12) s2.15 · N 0.39 (14) qi qi x3 | 0.44 | string · 0–4.4 · [1.8, 1.6, 0.5] · 6 |
| **Severed Pillar** `pillarFall` (1 (fell)) | N 0.61 (18) s2.4 go | 0.56 | terrain · 0–18 · [1.8, 2, 1.4] · 9 |
| **Flying Lantern** `lanternKick` (1 (kick)) | B 0.59 (22) cast:lantern go | 0.34 | terrain · 0–18 · [1.3, 1.5, 1] · 10 |
| **Three Tolls** `bellToll` (1 (toll)) | N 0.64 (12) cast:toll go · N 0.40 (12) cast:toll · B 0.46 (18) cast:toll | 0.52 | terrain · 0–22 · [1.1, 1.5, 1.2] · 14 |
| **Swallow's Return** `swallowReturn` (1 (spring)) | B* 0.85 (24) s2.5 lock spring | 0.44 | terrain · 0–5.5 · [1.3, 1.6, 1.1] · 8 |
| **Rising Flagstone** `flagKick` (1 (flag)) | B 0.55 (18) cast:flag go | 0.36 | terrain · 3.5–14 · [1, 0.6, 0.4] · 9 |
| **Flagstone Volley** `flagVolley` (2 (flag)) | B 0.55 (16) cast:flag go · B 0.44 (16) cast:flag go · B 0.44 (18) cast:flag go | 0.40 | terrain · 3.5–14 · [0, 1.1, 0.8] · 11 |
| **Scattered Flagstones** `flagFan` (3 (fan)) | B 0.69 (16) cast:fan go | 0.40 | terrain · 3.5–13 · [0, 0, 1.3] · 10 |
| **Thousand Needles** `needles` (2) | N 0.46 (10) l1.95 · N 0.31 (10) l1.95 · N 0.31 (10) l1.95 · N 0.31 (10) l1.95 · B 0.35 (18) l1.95 dash 2.2 | 0.56 | string · 0–3.8 · [0, 2.6, 3] · 6 |
| **Hundred Petals** `petals` (2) | N 0.46 (11) s2.15 · N 0.31 (11) s2.15 · N 0.31 (11) s2.2 · N 0.31 (11) s2.2 · B 0.37+0.10 (18) s2.3 lock · N 0.33 (10) s2.15 · N 0.31 (10) s2.15 · N 0.31 (10) s2.15 · B 0.33 (16) l2 dash 2.2 · R 0.57 (26) l2.1 dash 2.6 mikiri | 0.64 | string · 0–3.6 · [0, 2.6, 2.6] · 9 |
| **Ember Whirl** `emberWhirl` (2) | N 0.46 (14) r2.2 · N 0.33 (14) r2.2 · R 0.55 (26) r3.4 kd | 0.52 | string · 0–3.8 · [0, 2, 1.2] · 7 |
| **Heaven-Splitting Fall** `heavenFall` (2) | R 1.06 (30) r2.6 burn:ring kd | 0.60 | hazard · 4.2–14 · [0, 2.2, 1.4] · 9 |
| **Cinder Cross** `burningCross` (2) | N 0.46 (10) s2.15 burn:along · R 0.52 (22) s2.2 burn:across · N 0.33 (10) s2.15 · B* 0.39 (18) l2 dash 2.2 | 0.48 | string · 0–3.8 · [0, 2.4, 1.8] · 6 |
| **Ember Fan** `emberFan` (2) | N 0.46 (14) qi qi x3 · N 0.40 (14) qi qi x2 · N 0.40 (14) qi qi x3 | 0.44 | ranged · 6.5–16 · [0, 1.6, 0.4] · 7 |
| **Zig-Zag Embers** `zigzag` (2) | N 0.48 (14) s2.2 dash 4.5 burn:path zig · N 0.44 (14) s2.2 dash 4.5 burn:path zig · B* 0.46 (20) s2.2 dash 4.5 burn:path lock zig | 0.48 | hazard · 3–10 · [0, 2.2, 0.9] · 8 |
| **Falling Embers** `leapingString` (2) | N 0.46 (10) s2.3 dash 4.5 leap · R 0.50 (22) s2.3 dash 3 leap · B 0.46 (18) s2.4 dash 3 leap burn:along lock | 0.52 | string · 2.5–8 · [0, 2.2, 1.8] · 8 |
| **Brand and Kick** `kickBrand` (2) | N 0.44 (10) l2 dash 2.2 burn:along · R 0.52 (22) s1.9 · B* 0.44 (18) s2.4 dash 3.4 leap lock | 0.48 | string · 0–4.2 · [0, 2.2, 1.2] · 7 |
| **Scattered Petals** `ashString` (3) | N 0.42 (10) s2.15 · N 0.30 (10) s2.15 flit · N 0.33 (10) s2.2 · R 0.52 (22) s2.15 flit · B* 0.39 (18) l2 dash 2.2 flit | 0.48 | string · 0–4.2 · [0, 0, 3] · 4 |
| **Ten Thousand Ashes** `ashFlurry` (3) | N 0.42 (11) s2.15 · N 0.30 (11) s2.2 flit · N 0.30 (11) s2.15 · R 0.52 (22) s2.15 flit · N 0.33 (10) l2 dash 2.2 · N 0.30 (11) s2.2 flit · B 0.37+0.10 (18) s2.3 lock · N 0.33 (10) s2.15 flit · N 0.30 (10) s2.15 · N 0.30 (10) s2.2 flit · R 0.57 (26) l2.1 dash 2.6 mikiri | 0.60 | string · 0–4 · [0, 0, 3.2] · 9 |
| **Storm of Ash** `qiStorm` (3) | N 0.46 (14) qi qi x3 · N 0.40 (14) qi qi x2 · N 0.40 (14) qi qi x3 · B 0.46 (18) qi qi x1 | 0.48 | ranged · 6.5–16 · [0, 0, 0.9] · 9 |
| **Ash Shadows** `ghostDash` (3) | N 0.48 (14) s2.2 dash 4.5 · N 0.42 (14) s2.2 dash 4.5 flit · N 0.42 (14) s2.2 dash 4.5 flit · R 0.57 (24) s2.2 dash 4.5 flit | 0.52 | string · 2.5–9 · [0, 0, 1.7] · 8 |
| **Ash Lotus** `flitLotus` (3) | N 0.44 (13) s2.15 · N 0.33 (12) s2.2 flit · N 0.31 (12) s2.15 · R 0.57 (22) r3 flit kd | 0.48 | string · 0–4 · [0, 0, 2.2] · 6 |
| Scattering Ash `streakFlurry` (counter) | N 0.57 (14) s2.15 · N 0.44 (14) s2.2 flit · N 0.44 (14) s2.15 flit · N 0.44 (14) s2.15 flit | 0.60 | - |
| Riposte `riposte` (counter) | N 0.42 (16) s2.15 · B 0.33 (22) l2 dash 2.2 | 0.44 | - |
| Kindling (phase 2) `kindle` (phase change) | R 1.61 (10) r6 | 0.56 | - |
| Ash on the Wind (phase 3) `ashWind` (phase change) | R 1.60 (10) r6 kd | 0.56 | - |

The Riposte comes only from his guard or after he wins a blade lock; Scattering Ash is his flurry
(*A foe's streak and his flurry*). The heaviest blow is still Black Tide's 38 (43.7 as dealt); no new
blow is above 26.

**His look and motion (owner picks, 2026-11-12):** a small straw hat (r 0.235 m), a long slender jian
(a 1.28 m blade from the guard, tapering to 60 %, bevelled edges and a ridge, disc guard and pommel,
a banded grip, a red tassel) held in **the classic jian guard** (pick "A" of three stances): side-on
and sunk, the right foot forward, the blade at chest height pointing straight at the hero, the free
hand's sword-finger raised in an arc over the head. His cuts are authored as the blade's path; the
hand follows the steel (poses.js `arm`), the hips and chest turn with it, the front foot steps in.

Numbers (`tuning.js`): HP 3000, phases at [1, 0.64, 0.36]; posture max [320, 380, 380], regen after
2.5 s at 20 / s, parries `POSTURE.parry` (26 / 48), weapon hits 5 / 16 that land, guarded 8 / 20, a
parried Ash Crescent 8; the moments above. Part multipliers head 1.3, body 1, legs 0.9. Every blow he
deals (the table's damage, the crescents, the shove) × `damageScale` 1.15 (a 26 lands as 30). None of
these changed in the second pass. **His body, dressed by phase** (the owner's pick, ADR-122; `?ashLook=`,
STYLE.md "The look switches"): in phase 2 the robe's hem and the free sleeve's cuff smoulder; in phase 3
the hat is gone, his hair hangs loose and the robe is burnt pale with a frayed hem.

**Measured (the tuning pass and the final build, 2026-11-16; `tests/integration/duel.mjs`).** What was
measured is what bots do, not what a person feels: **no human has played the second pass yet.**
- **Pace** (PACE: a god-mode defender that guards and rolls and never attacks, roaming 2.5 – 9 m from
  him; the final build, ten seeds (4242, 7, 99, 1337, 2024, 11, 23, 555, 808, 31337) × 120 s a phase):
  cues a minute (min / mean / max) **phase 1 73.5 / 77.8 / 81.2, phase 2 89.7 / 92.9 / 95.9, phase 3
  97.4 / 100.0 / 104.3**; before the pass 60.2 / 76.0 (no phase 3). Each phase busier than the one
  before on every seed (phase 2 / phase 1 at least × 1.134, × 1.194 in the mean; phase 3 / phase 2 at
  least × 1.018, × 1.078 in the mean). Longest gap between two cues (max / mean of the seeds) 3.07 /
  2.70, 2.92 / 2.16, 2.65 / 2.12 s. A dodge for 13 / 17 / 19 % of the cues (5 / 6 / 9 % before the
  tuning pass); burning ground alive 0 / 32 / 20 % of the time. Conflicts (two cues under 0.3 s apart
  needing different answers) 0. Phase 3 runs at the speed floors: about 100 cues a minute is what
  0.42 s / 0.32 s allow. The meter `pressure.meter` asserts each phase ≥ [1, 1.05, 0.95] × the one
  before per seed and [1, 1.14, 1.035] × in the seeds' mean, at least 68 / 82 / 90 cues a minute and no
  gap over 3.6 / 3.4 / 3.15 s: set about 8 % under the worst seed's ramp, 4 % under the mean's, 7 – 9 %
  under the slowest seed's rate and half a second over the longest gap, because the same seed
  replayed a different fight after each merge (a phase's rate moved by up to 5 %).
- **Mortal bots** (whole fights on the real set, seeds 4242 / 7 / 99; `node tests/integration/duel.mjs
  . bots`, opt-in; the tuning pass): the 95 % bot wins all three in 52 – 58 s (16 – 25 / 13 – 14 / 20 –
  22 s per phase; on `main` 50 – 63 s); the 85 % bot wins all three in 53 – 61 s with 0 – 70 damage taken
  and no flask. **On the final build the 70 % bot dies in one or two of three** (two of three in one run,
  one of three in another: these outcomes move by a whole fight between builds, as each merge replays
  the seeds differently). Worst blow taken 20.7 / 16.1 / 25.3 (tuning pass); worst second 50.6 (57.5 on
  `main`). A pure defender (answers 95 %, never swings) survives 8 of 9 phase runs. **The bot targets
  are not met**: the 85 % bot is in no danger. Each fight sees 2 – 4 posture breaks with executions of
  260 each, and the hero's counter flurries deal about a third of the damage. The levers are health and
  posture, which this pass left alone.
- **Fairness sweep** (`duel.mjs . answer`, opt-in): every AI move in every phase it is in, from five
  distances across its band, both sides, against the parrying bot: 830 runs standing and 830 walking
  in, no blow lands.
- **Not measured:** a human's fight; a phone's frame rate (the shared GPU made frame times
  meaningless); the 70 / 85 % bots' hits per missed cue are low (a string stops after its first hit
  lands; the hero cannot be hit in his flurries). The bots never use the blade lock or the mikiri.
  Target: 1.5–2.5 min for a player who knows him.

## The Starless Lord (2026-11-13, ADR-068 – ADR-070; the second pass: 2026-11-16, ADR-122; `?level=starless`)
Varr Nihil, a dark lord who fell out of the night sky and took the Obsidian Throne: a full harness
of black plate, a deep hood over a faceplate with one slit of red light, a cape to his ankles, blades
of red light, and the Void in his free hand (his look and motion: ADR-084, ADR-085). The owner's
brief: very fast, acrobatic and fluid, strings of six with variations, jump and flip attacks, spells
between the cuts, four blade forms. He runs on the duelist engine (the Ash Disciple's: the guard, the
deflect chain, the blade lock, the mikiri, the full deflect, the Ghostep behind him, pressure and
hit stun are all as written above; his pressure and its fairness guard: *The duelists' pressure and
the fairness guard*, below), with these differences.

**Four forms, four bars, a deathblow each** (the owner's pick):
| Form | Blades | Reach | A string's follow-up windup | Recovery × |
|---|---|---|---|---|
| 1 | one blade, the free hand casts | 2.3 m | 0.34 s | 0.9 |
| 2 | twin blades (the off hand's own) | 2.3 m | 0.32 s | 0.85 |
| 3 | the blades joined: a staff lit at both ends | 2.95 m | 0.30 s | 0.8 |
| 4 | one long cross-hilted blade, two-handed, the Void's aura | 2.6 m | 0.28 s | 0.72 |

- Each form has its own bar of 1400 HP (the boss bar shows four pips). **An empty bar does not kill
  him: it breaks him**, as a full posture meter does: on one knee for 4.5 s. An attack within 3.4 m
  then is the **deathblow** (the hero's execution thrust; DEATHBLOW call-out, the cinematic moment):
  the form ends. He is thrown back, rises, and the next form **ignites**: 2.1 s, then a red shock ring
  (r 6.5 m, 12 damage, knockback 7: roll through it or stand clear); nothing lands on him from the
  deathblow until that ring goes out. The fourth deathblow kills him.
- A break nobody answers: he rises with 20 % of the bar back (if it was empty) and half the meter.
- **Posture, the Sekiro rule:** every posture gain is × 0.45 on a full bar rising to × 1.25 on an empty
  one, and the meter recovers × 1.5 on a full bar down to × 0.5 on an empty one (22 / s after 2.2 s).
  Pure deflecting breaks him, slowly; cutting his bar down first makes his posture give way. Meter:
  [460, 500, 540, 600] per form. A parry gives the usual 26 / 48 (normal / blue) before that factor.
- **Speed:** a move's first hit winds up 0.48 – 0.62 s in form 1 (red 0.62 – 0.8 s); later forms scale
  windups × [1, 0.94, 0.89, 0.83] (a `fixed` beat keeps its time), so a string's blows land 0.42 s
  apart in form 1 and 0.36 s in form 4 (Shen Hui: 0.42 s). The glint comes 0.26 s before every impact
  (his `flashLead`; Shen Hui's is 0.3 s) and never before the blow ahead of it has landed. Breathers
  (`idleGap`) [0.1 – 0.3, 0.07 – 0.22, 0.05 – 0.16, 0.03 – 0.1] s, after an opening of the hero's the
  old [0.14 – 0.4, 0.1 – 0.32, 0.08 – 0.26, 0.05 – 0.18] s (`openingGap`); the flow roll [0.55, 0.62,
  0.7, 0.78] (it was [0.4, 0.5, 0.55, 0.65]), at most [4, 4, 7, 7] moves in a row, then a breather of
  [0.45 – 0.75, 0.4 – 0.65, 0.25 – 0.45, 0.2 – 0.4] s (ADR-122; *The duelists' pressure and the fairness
  guard*, below). **For him a red and a white cue are at least 0.4 s apart** (`pressure.guard.sep`
  0.4, the rule's 0.3 s plus room: a roll allows no guard until 0.52 s after it starts, and a white
  blow 0.3 – 0.4 s after a red one killed a 95 % bot on one seed).
- **He keeps to the crater's floor** (a circle of 13.6 m round the seal, and off the dais; the plates
  end at 15 m and the rim's slabs stand beyond), so a hero backed against the rim is still in his
  reach. The crater has no walls: the hero can leave it between the slabs. He walks inside striking
  range; outside it he **glides**: 6 m/s, and 9.2 m/s past 5.5 m (the hero sprints at 7.2), carried a
  hand's breadth over the floor with his cape streaming. He steps back and aside the same way.
  **Not fixed:** behind the throne (z -28 … -39) nothing of his reaches (his floor ends at z -10.6,
  nothing he throws flies past 16 m): a hero can hide there.
- Every blow × `damageScale` 1.1. Health (1400 a form), posture and damage are as before the second
  pass. **His body, dressed by form** (the owner's pick, ADR-122; `?lordLook=`, STYLE.md "The look
  switches"): the cape torn away sheet by sheet, cracks of red light, in form 4 the hood thrown back
  and the faceplate split.

### Four forms, each busier (2026-11-16, ADR-122)
The same recipe as Shen Hui's: more pressure, not more damage, and more of the Void live on the floor
while he cuts, form by form. No new blow is above 26 before `damageScale`; Nightfall stays the one
black move of each form; a perilous thrust (mikiri) is in every form.
- **Form 1, the blade and the hand:** spells INSIDE his strings: Lightning Verse (two bolts between
  the cuts), Drawn to the Blade (a pull into a cut), Breaking Wave (a push to open a string), Crushing
  Verse (the Crushing Dark as a string's end), Veiled Hand (a feint inside a string), and one blink
  (Hollow Step: gone, and a red blow from behind). Nothing lingers yet.
- **Form 2, twin blades:** two things in the air at once. Wheeling Blade (his main blade thrown in the
  middle of a string while he fights on with the off hand; it wheels wide and comes in from the side,
  then home to his hand), Hunting Wings (a string that chases), Crossed Tides (crossed-blade
  crescents), Twin Cartwheel; the floor tears open (Rupture).
- **Form 3, the staff:** strings that walk the hero down and end in fissures (Walking Mountain);
  torn stones that orbit him and fire into the gaps of the string he is cutting (Wheel of Stones); a
  Dark Star cast inside a string (Star in the Hand); Grinding Wheel; the Falling Halo. The floor is
  rarely empty (something of his lingers on it about a quarter of the time: the first tuning round).
  Wheel of Stones is picked only within 4.4 m (it was 6 m: from there its cuts could not reach).
- **Form 4, the Void:** blink strings (Void Waltz: six blows, each out of a blink), lightning between
  cuts (Thunder Between), Hollow Crown, Crimson Eclipse (four red blows), the **Starless Sky as
  weather**, and the great spell, **Starless Night**. Something lingers on the floor about half the
  time (the first tuning round); 39 % of his cues ask for a dodge.
- **After a red spell or a thrown piece he follows with a red blow** (`links.js` `AFTER_RED`: Reaping
  Arc, Red Meridian, Hollow Step, Crimson Eclipse, Starfall, Nightfall), not a guard string the
  fairness guard would then have to feint. **A blow out of a blink meets a guard from any side** (until
  this pass a guard or a parry of a blow that arrived behind the hero simply failed). While his blade
  is in the air he starts no blade move. While Starless Night's waves run he picks nothing that asks
  a guard: he stands in the eye or uses dodge-only moves.

**The Void** (his spells; each is read and answered like a blade; *in italics* the new ones of
ADR-122):
| Spell | Tell | What it is | Answers |
|---|---|---|---|
| **Void lightning** | blue | 0.78 s with the hand raised, crackling, then a bolt down a 17 × 1.7 m line he tracks until 92 % of the windup; from form 1 also inside his strings (0.42 s as a string's beat) | **parry** (it counts in a string's deflect chain: 48 posture); a **perfect parry sends it back**: 55 damage and 34 posture to him, RETURN; block costs guard (x 1.5); roll |
| **Void push** | normal | a wall of force 4.8 m wide along the floor at 12.5 m/s (15 damage, thrown back 6.5 m); also the opening of Breaking Wave | parry cuts it (it cues itself 0.26 s before it reaches you); block: guard and a shove; roll through |
| **Void pull** | red | 0.8 s (0.5 s inside Drawn to the Blade), then a 11 × 2.4 m line: 5 damage and you are dragged 5.5 m to him, into the blow that follows | roll (i-frames): the pull misses; a block is broken |
| **Returning blade** (forms 2, 3) | normal | the blade thrown spinning: out 12.5 m at 15 m/s, it hangs 0.32 s, then home to his hand at 17 m/s through you again (16 each way). It may hang up to 0.4 s longer at its turn, or come home uncued and harmless, to keep clear of a cue of the other answer | parry each pass (each cues itself); a parry on the way out turns it for home at once; roll |
| *The wheeling blade* (form 2, Wheeling Blade) | normal | his main blade thrown as the string's third beat (14); it wheels wide round you (to a side drawn as it leaves) and comes in from that side 0.7 – 1.8 s later, between two off-hand cuts, then home: the `catch` beat (no hit), then a blue parry moment | parry or guard it from any side (it cues itself); roll |
| **Torn stone** (forms 3, 4) | normal + red | floor torn up beside him: three stones (14) thrown 0.42 s apart at 16 m/s, then a great one (red, 27, knockdown); a stone may wait up to 0.9 s more in his grip | parry / cut the small ones, roll the great one |
| *Orbiting stones* (form 3, Wheel of Stones) | normal | three torn stones turn round HIM (r 2.6 m) as the string starts and fly at you one at a time into its gaps, each a fixed 0.55 s flight so its cue always comes in time (14) | parry each at its glint, or roll |
| *The Starless Sky as weather* (form 4) | red | through the whole form, in his moves' pauses: a strike called near where you are heading every 3.2 s with his bar full, down to every 1.8 s with it empty, 25 – 60 % of them with a second one 3.8 m off, at most 2 live; a red ring (r 2.1 m) for 1.1 s, then the bolt (22, knockdown). Never in your opening. The six-strike cast (the move The Starless Sky) is still his too: six strikes 0.5 s apart, r 2.3 m, 0.95 s, 26 | leave the ring or roll as it lands |
| *Starless Night* (form 4, the great spell) | red, red | 14 s into form 4 at the earliest, then every 32 s at most: a red ring slam round him (r 3 m, 24, knockdown; 1.2 s), then the blade driven into the floor and three waves of the Void run out across the whole crater, 0.9 s apart at 8 m/s, out to 16.5 m (22 each) | roll through each wave as it reaches you (each cues itself), or stand in the eye: a wave that is already on you before it could cue passes |
| **Red tide** (form 4) | normal | three cuts that throw crescents of red light (1, a fan of 3, 1) at 14 m/s | parry, roll, block costs guard |
| **The blink** (form 1 Hollow Step; form 4 Void Rend, Void Waltz, Hollow Crown, Crimson Eclipse) | - | as a cut's windup starts he is gone and 2 m behind you (to your side if there is no floor there); a shape of him is left where he stood | turn and parry, or roll: the cut is cued as any other, and a white or blue one can be guarded from any side |
| **Crushing Dark** (forms 1, 4) | red | 0.95 s: his open hand lifts and five talons of the Void close on where it is aimed (on you while he tracks you, until 88 % of the windup); a 9.5 × 2.2 m line. Caught: 30 damage, you are thrown to the floor and the Void presses down for 0.55 s. Crushing Verse ends a string with it (0.6 s, 26) | roll through the instant it closes, or be out of its line; a block is broken |
| **The Rift** (forms 3, 4) | normal | 0.9 s: the staff raised and driven into the floor; three fissures of red light (five in form 4) race out in a fan at 13.5 m/s (16 each); Walking Mountain ends in three | parry the one that comes for you (each cues itself), or step between them; roll |
| **Dark Star** (forms 3, 4) | red | 0.9 s: a starless sun leaves his hand, drifts after you at 2.3 m/s for 1.7 s over a violet ring (r 3 m), then bursts (30, knockdown); he fights on meanwhile. Star in the Hand casts it inside a string (0.46 s, 26) | be out of the ring when it bursts, or roll at its cue (it stops following you then) |
| **Parting Light** (forms 2, 3, 4) | normal | a backflip 4 m away from you, and crescents of red light as he lands (2, 2, 3 by form) at 12 m/s | parry, roll, block costs guard |

**He uses the crater** (ADR-109; the floor and thrown pieces: ADR-122; `starlessLord/terrain.js`,
numbers `TUNING.terrain`). Five moves on the pieces of his level, chosen only while there is a piece
for them. **A thrown piece shows the flare only** (the owner, ADR-122; this supersedes ADR-109's
landing rings for thrown pieces, as ADR-119 did for the wyrm's): nothing is drawn where it will land;
its red flare is drawn on the flying piece 0.26 s before it lands and a roll at the flare always goes
through it. Crown Fall's toppled piece keeps the world's marked strip. Through each windup the Void
gathers in his hand, a held piece is wrapped in it and leaves with a stroke of it.
| Move | Tell | What happens | Answer |
|---|---|---|---|
| **Void Hurl** (every form) | red | 1.0 s: a stone that hung in the air (once they are spent: a plate torn out of the floor near him; then the nearest shard, the big rim slabs last) comes out of its place and hangs beside him, then is thrown at you (a little ahead if you are moving): 0.8 – 1.1 s in the air, the flare on it 0.26 s before it lands (26, knockdown, within 1.8 m) | roll at the flare, or never stop moving; stagger him in the windup and the stone drops where it hangs |
| **Glass Rain** (forms 3, 4) | red | 1.2 s: three pieces gather round him (topped up with floor plates) and leave 0.55 s apart, each at you, the later ones up to 1 m off (20 each, knockdown) | keep running one way, or roll each at its flare |
| **Crown Fall** (forms 2 – 4) | red | 0.85 s, only while you stand in the strip a tall piece would fall on: his hand closes on it and wrenches it down. The fall is the world's (below): its strip is marked red from the moment it goes, about 0.85 s for a 3.6 m shard (22 x the piece's weight, knockdown) | step out of the strip: sideways is shortest |
| **Rupture** `plateRupture` (forms 2 – 4) | red | 0.9 s: the floor tears open in a line from him toward you, plate after plate bursting up out of it (from 1.8 m out, a plate every 1.5 m, up to 7, 0.2 – 0.16 s apart by form, on to 2.5 m past you), each with its flare on the plate (22, knockdown, r 1.25 m). Up to four red flares in about 0.6 s for one line: the same answer | step off the line, or roll at the plate under you |
| **Falling Halo** `plateHalo` (forms 3, 4) | red | 1.0 s: the Void lifts a ring of 4 (form 4: 5) plates round you (2.4 – 4.8 m out, 2.7 m up), open on the side away from him, and drops them on you one after another, 0.5 s apart (0.46 in form 4), each with its flare (22, knockdown, r 1.4 m); needs 3 whole plates in reach (in form 4 it sometimes finds only 3) | keep moving through the open side, or roll each at its flare |

The crater's pieces are finite: six stones in the air, then floor plates, shards and slabs; what he
throws is gone until the fight resets. Torn Stone leaves the floor cracked where each stone was torn.
Every piece is known to the cue ledger before its cue; the fairness guard may hold a halo's drop, push
the Rupture back (its plates that may cue are all cleared together), or let a piece land uncued and
harmless rather than cue it beside a blow that asks the other answer.

Thrown things (the push, the crescents, the fissures, the blade, the stones) cue themselves
`flashLead` before they reach the hero; a crescent, the push or a fissure that could only cue later
than 0.24 s before contact fizzles, a stone or the blade later than 0.2 s, as the wyrm's bullets do. A
strike called from the sky (the Starless Sky, the Dark Star) is marked on the ground from the moment
it is called; it may strike up to 0.9 s late, or fade, for the fairness guard.

**Moves** (`starlessLord/moves.js`, ADR-122; generated from the data by the tuning pass's
`gen-moves.mjs` on 2026-11-16; `node tests/integration/lord.mjs . moves` checks every new one). Tells
N normal, B blue, R red, K black; a hit: `tell windup (damage) [extras]`, **windups at form 1's
pace** (forms 2 – 4 × 0.94 / 0.89 / 0.83, not `fixed` beats; recoveries × 0.9 / 0.85 / 0.8 / 0.72);
`one of { a / b }` = one is drawn as the move starts; `hold` a bait hold at the cock (s); `FLARE` a
blue parry moment; `LOCK` / `MIKIRI` as Shen Hui's; `blink behind 2 m`, `release` / `cast` a thing
sent out (push, crescent, rift, glaive, wheel, debris, storm, star, night; terrain: hurl, rain, fall,
rupture, halo). Damage before `damageScale` 1.1. A move is listed under the form it first appears
in; weights per form [1 / 2 / 3 / 4] (- = not in that form). His links: `starlessLord/links.js` (one
pursuit list shared by the strings, each string's own close follow-ups, `AFTER_RED` after a red
spell or a thrown piece, `AFTER_SPELL` after Rupture and the Halo).

*Form 1, the blade and the hand*

| Move | Forms (weight per form) · band m · cooldown s · cat | Hits (tell windup (damage) [extras]; `one of { a / b }`) |
|---|---|---|
| **Crimson Litany** `litany` | 1 (2.6 / - / - / -) · 0–3.8 · 6 · string | N 0.48 (13) · N 0.34 (12) · one of { N 0.38 (13) [ring 2.3 m] / N 0.34 (12) } · one of { B 0.42 (20) [lock, hold 0.1-0.3] / B 0.4 (19) [line 2.05 m, dash <=2.4 m] } · N 0.36 (12) · one of { B 0.6 (24) [lock, lift] / B 0.58 (22) [lift] / N 0.34 (12) } · B 0.4 (19) [line 2.05 m, 50 %, dash <=2.4 m] |
| **Void Cadence** `cadence` | 1 (2.4 / - / - / -) · 0–4.2 · 7 · string | N 0.5 (13) · N 0.34 (12) · N 0.55 (15) [release push, fixed] · N 0.46 (12) · N 0.34 (12) · one of { B 0.4 (20) [line 2.05 m, dash <=2.4 m] / B 0.62 (20) [bolt, line 17 m, fixed] } |
| **Starless Dirge** `dirge` | 1 (2.2 / - / - / -) · 1.6–6 · 7 · string | N 0.5 (15) [line 2.05 m, dash <=3.8 m] · N 0.36 (12) · B 0.58 (22) [lift] · N 0.36 (12) · one of { R 0.62 (22) [ring 2.9 m, knockdown] / B 0.56 (20) [bolt, line 17 m, fixed] } |
| **Starless Lunge** `lunge` | 1, 4 (2 / - / - / 0.8) · 2.6–7 · 2.5 · closer | N 0.5 (17) [line 2.05 m, dash <=5 m] |
| **Falling Star** `skyfall` | 1, 2, 4 (2 / 1.6 / - / 1.2) · 2.2–7.5 · 4 · closer | B 0.72 (26) [lock, FLARE, dash <=5.5 m, lift] |
| **Reaping Arc** `reap` | 1 (1.5 / - / - / -) · 0–3.4 · 6 · area | R 0.62 (22) [ring 2.9 m, knockdown] |
| **Void Lightning** `voidBolt` | 1, 2, 3 (1 / 0.8 / 0.5 / -) · 4.5–16 · 5 · spell | B 0.78 (24) [bolt, line 17 m] · B 0.5 (22) [bolt, line 17 m, 50 %] |
| **Void Push** `voidPush` | 1, 2, 3, 4 (1 / 0.8 / 0.5 / 0.7) · 2.5–11 · 5 · spell | N 0.62 (15) [release push] |
| **Grasp and Sever** `grasp` | 1, 2, 3, 4 (1.4 / 1 / 1.2 / 1) · 4.5–10.5 · 8 · spell | R 0.8 (5) [pull, line 11 m, fixed] · B 0.62 (24) [lock, FLARE, fixed] |
| **Crushing Dark** `grip` | 1, 4 (0.9 / - / - / 0.8) · 3–9 · 10 · spell | R 0.95 (30) [Crushing Dark, line 9.5 m, knockdown, fixed] |
| **Severance** `severance` | 1, 2, 3, 4 (1.5 / 1.3 / 1 / 1) · 3.4–9.5 · 6 · closer | B 0.66 (26) [lock, FLARE, dash <=7.5 m] |
| **Red Meridian** `meridian` | 1, 2, 3, 4 (1.5 / 1.8 / 1.2 / 1.5) · 2.4–8 · 8 · closer | R 0.66 (22) [dash <=6 m] · R 0.72 (24) [ring 2.9 m, knockdown] |
| **Nightfall** `nightfall` | 1, 2, 3, 4 (1.1 / 1.1 / 1 / 1) · 2.4–9 · 12 · closer | K 1.45 (36) [knockdown, fixed, hold 0.1-0.5, dash <=7.5 m] |
| **Veiled Hand** `veiledHand` | 1 (2.2 / - / - / -) · 0–4 · 7 · string | N 0.48 (13) · N 0.34 (12) · FEINT 0.28 · N 0.36 (12) · N 0.34 (12) · one of { R 0.62 (26) [line 2.4 m, MIKIRI, dash <=2.8 m] / B 0.42 (20) [lock, FLARE, hold 0.1-0.25] } |
| **Lightning Verse** `voidVerse` | 1 (2.4 / - / - / -) · 0–4.4 · 7 · string | N 0.48 (13) · B 0.42 (18) [bolt, line 17 m] · N 0.34 (12) · N 0.34 (12) · B 0.42 (18) [bolt, line 17 m] · one of { B 0.4 (19) [line 2.05 m, dash <=2.4 m] / B 0.6 (24) [lock, lift] } |
| **Drawn to the Blade** `drawnIn` | 1 (2 / - / - / -) · 0–6 · 8 · string | N 0.48 (13) · N 0.34 (12) · R 0.5 (5) [pull, line 11 m] · N 0.4 (13) · B 0.44 (22) [lock, FLARE] |
| **Breaking Wave** `pushOpening` | 1 (1.8 / - / - / -) · 5–8.5 · 8 · string | N 0.5 (15) [release push] · N 0.72 (15) [line 2.05 m, dash <=6.5 m] · N 0.34 (12) · N 0.34 (12) · R 0.6 (22) [ring 2.9 m, knockdown] |
| **Crushing Verse** `crushingVerse` | 1 (2 / - / - / -) · 0–4 · 9 · string | N 0.48 (13) · N 0.34 (12) · N 0.34 (12) · N 0.36 (12) · R 0.6 (26) [Crushing Dark, line 9.5 m, knockdown] |
| **Hollow Step** `hollowStep` | 1 (1.8 / - / - / -) · 2–9 · 7 · closer | R 0.66 (24) [knockdown, fixed, blink behind 2 m] |
| **Void Hurl** `voidHurl` | 1, 2, 3, 4 (1.3 / 1.1 / 1 / 1.2) · 4.5–16 · 9 · terrain | R 1 (26) [cast hurl, fixed] |

*Form 2, twin blades*

| Move | Forms (weight per form) · band m · cooldown s · cat | Hits (tell windup (damage) [extras]; `one of { a / b }`) |
|---|---|---|
| **Twin Tempest** `tempest` | 2 (- / 2.4 / - / -) · 0–3.8 · 6 · string | N 0.48 (11) · N 0.34 (11) · N 0.34 (11) · N 0.34 (11) · one of { B 0.42 (20) [lock, hold 0.1-0.28] / B 0.4 (18) [line 2.05 m, dash <=2.4 m] } · N 0.36 (11) · N 0.34 (11) |
| **Bladed Gale** `gale` | 2 (- / 2.4 / - / -) · 0–3.8 · 7 · string | N 0.5 (13) [ring 2.3 m] · N 0.36 (13) [ring 2.3 m] · N 0.36 (11) · N 0.34 (11) · one of { B 0.6 (24) [lock, lift] / R 0.62 (22) [ring 2.9 m, knockdown] } · N 0.66 (14) [release crescent x2, fixed, 60 %, walks -4 m, lift] |
| **Pinwheel** `pinwheel` | 2 (- / 2.2 / - / -) · 1.5–6.5 · 7 · string | B 0.62 (22) [lift] · N 0.34 (11) · N 0.34 (11) · N 0.46 (14) [release crescent x2] |
| **Scissor** `scissor` | 2 (- / 2 / - / -) · 2.6–7 · 3 · closer | B 0.52 (22) [line 2.1 m, lock, FLARE, dash <=5 m] |
| **Returning Blade** `glaive` | 2, 3 (- / 1.2 / 0.6 / -) · 4–13 · 9 · ranged | N 0.6 (16) [cast glaive] |
| **Reaping Arcs** `reap2` | 2 (- / 2 / - / -) · 0–3.4 · 6 · single | N 0.5 (13) [ring 2.3 m] · R 0.6 (22) [ring 2.9 m, knockdown] |
| **Wheeling Blade** `wheelingBlade` | 2 (- / 2.6 / - / -) · 0–4 · 8 · string | N 0.48 (11) · N 0.34 (11) · N 0.46 (14) [cast wheel] · N 0.36 (11) · N 0.34 (11) · catch (feint) 0.3 · B 0.44 (20) [lock, FLARE] |
| **Hunting Wings** `wingedPursuit` | 2 (- / 2 / - / -) · 1.5–8 · 7 · string | N 0.5 (14) [line 2.05 m, dash <=4.5 m] · N 0.36 (11) [dash <=3 m] · N 0.36 (11) [dash <=3 m] · N 0.36 (11) [dash <=3 m] · B 0.5 (22) [line 2.1 m, lock, FLARE, dash <=4 m] |
| **Crossed Tides** `crossedTides` | 2 (- / 2 / - / -) · 0–4 · 8 · string | N 0.48 (11) · N 0.34 (11) · N 0.36 (11) · N 0.66 (14) [release crescent x2, fixed, walks -4 m, lift] · B 0.72 (22) [line 2.1 m, lock, FLARE, dash <=5 m] |
| **Twin Cartwheel** `twinCartwheel` | 2 (- / 2.2 / - / -) · 0–4 · 7 · string | N 0.48 (11) · N 0.34 (11) · B 0.56 (20) [lift] · N 0.36 (11) · N 0.34 (11) · N 0.34 (11) · one of { R 0.62 (26) [line 2.4 m, MIKIRI, dash <=2.8 m] / B 0.58 (22) [lift] } |
| **Crown Fall** `crownFall` | 2, 3, 4 (- / 1.5 / 1.4 / 1.6) · 2.5–18 · 10 · terrain | R 0.85 s 0 [cast fall, fixed] |
| **Rupture** `plateRupture` | 2, 3, 4 (- / 1.5 / 1.4 / 1.1) · 3.5–14 · 10 · terrain | R 0.9 (22) [cast rupture, fixed] |
| **Parting Light** `parting` | 2, 3, 4 (- / 1 / 0.9 / 0.9) · 0–3 · 8 · ranged | N 0.66 (14) [release crescent x1/2/2/3, fixed, walks -4 m, lift] |

*Form 3, the staff*

| Move | Forms (weight per form) · band m · cooldown s · cat | Hits (tell windup (damage) [extras]; `one of { a / b }`) |
|---|---|---|
| **Cyclone** `cyclone` | 3 (- / - / 2.4 / -) · 0–4.4 · 6 · string | N 0.5 (13) · N 0.34 (13) · N 0.38 (14) [ring 2.95 m] · N 0.36 (14) [ring 2.95 m] · one of { B 0.44 (22) [lock, hold 0.1-0.3] / B 0.4 (20) [line 2.7 m, dash <=2.4 m] } · one of { R 0.62 (24) [ring 3.55 m, knockdown] / B 0.6 (26) [lock, lift] } |
| **Turning Mill** `mill` | 3 (- / - / 1.3 / -) · 1.5–6.5 · 7 · string | N 0.52 (12) [ring 2.95 m, walks 1.9 m] · N 0.34 (12) [ring 2.95 m, walks 1.5 m] · N 0.34 (12) [ring 2.95 m, walks 1.5 m] · N 0.34 (12) [ring 2.95 m, walks 1.5 m] · B 0.42 (21) [line 2.7 m, dash <=2.4 m] |
| **Starfall** `starfall` | 3, 4 (- / - / 1 / 0.6) · 4.2–14 · 9 · area | R 1.15 (30) [ring 2.8 m, knockdown, leap apex 3.8 m] |
| **Torn Stone** `debris` | 3, 4 (- / - / 1.2 / 0.9) · 5–15 · 10 · ranged | N 0.95 (14) [cast debris x3, fixed] |
| **Glass Rain** `glassRain` | 3, 4 (- / - / 1.6 / 1.6) · 4.5–16 · 13 · terrain | R 1.2 (20) [cast rain x3, fixed] |
| **Falling Halo** `plateHalo` | 3, 4 (- / - / 1.6 / 1.2) · 2–12 · 13 · terrain | R 1 (22) [cast halo x0/0/4/5, fixed] |
| **Drawn Under** `undertow` | 3 (- / - / 1 / -) · 4.5–10.5 · 8 · spell | R 0.8 (5) [pull, line 11 m, fixed] · N 0.62 (16) [ring 2.95 m, fixed] · B 0.42 (22) [lock] |
| **The Rift** `rift` | 3, 4 (- / - / 1.1 / 0.9) · 3–14 · 9 · spell | N 0.9 (16) [release rift x3/3/3/5, fixed] |
| **Walking Mountain** `walkingMountain` | 3 (- / - / 3.4 / -) · 0–5.5 · 7 · string | N 0.5 (12) [ring 2.95 m, walks 1.6 m] · N 0.36 (12) [walks 1.1 m] · N 0.36 (12) [walks 1.1 m] · N 0.36 (12) [ring 2.95 m, walks 1.2 m] · N 0.36 (13) [walks 1 m] · N 0.34 (13) [walks 0.9 m] · N 0.62 (16) [release rift x3, walks -3 m, lift] |
| **Wheel of Stones** `stoneWheel` | 3 (- / - / 2.4 / -) · 0–4.4 · 9 · string | N 0.5 (14) [cast debris (orbit) x3, fixed] · N 0.5 (13) · N 0.34 (13) · N 0.74 (13) [ring 2.95 m] · N 0.34 (13) · N 0.78 (13) · N 0.34 (13) · B 0.78 (21) [line 2.7 m, dash <=2.4 m] |
| **Star in the Hand** `starHand` | 3 (- / - / 2.2 / -) · 0–4.4 · 11 · string | N 0.5 (13) · N 0.34 (13) · R 0.46 (26) [cast star] · N 0.38 (14) [ring 2.95 m] · N 0.36 (13) · N 0.34 (13) · B 0.44 (22) [lock, hold 0.05-0.2] |
| **Grinding Wheel** `grindingWheel` | 3 (- / - / 2.8 / -) · 0–4.4 · 7 · string | N 0.5 (13) [ring 2.95 m] · N 0.34 (13) · N 0.34 (13) · N 0.36 (13) [ring 2.95 m] · N 0.34 (13) · R 0.58 (22) [ring 3.55 m, knockdown] · one of { R 0.62 (26) [line 2.95 m, MIKIRI, dash <=2.8 m] / B 0.6 (24) [lock, lift] } |
| **Dark Star** `star` | 3, 4 (- / - / 0.6 / 0.9) · 0–16 · 12 · hazard | R 0.9 (30) [cast star, fixed] |

*Form 4, the Void*

| Move | Forms (weight per form) · band m · cooldown s · cat | Hits (tell windup (damage) [extras]; `one of { a / b }`) |
|---|---|---|
| **Judgment** `judgment` | 4 (- / - / - / 2.8) · 0–4 · 6 · string | N 0.5 (14) · N 0.34 (13) · N 0.34 (13) · B 0.44 (22) [lock, hold 0.1-0.32] · one of { N 0.36 (13) / N 0.36 (13) } · one of { R 0.62 (28) [line 2.4 m, MIKIRI, dash <=2.8 m] / B 0.6 (26) [lock, lift] / B 0.58 (24) [lift] } |
| **Eclipse** `eclipse` | 4 (- / - / - / 2.4) · 0–4 · 7 · string | N 0.5 (13) · N 0.34 (13) · N 0.36 (14) [ring 2.6 m] · B 0.6 (20) [bolt, line 17 m] · N 0.42 (13) · one of { B 0.6 (26) [lock, lift] / B 0.4 (22) [line 2.35 m, dash <=2.4 m] } |
| **Void Rend** `rend` | 4 (- / - / - / 2) · 0–12 · 8 · string | N 0.75 (14) [blink behind 2 m] · N 0.6 (14) [blink behind 2 m] · B 0.68 (24) [lock, blink behind 2.1 m] |
| **Chained Lightning** `chain` | 4 (- / - / - / 1.6) · 4–16 · 9 · spell | B 0.8 (20) [bolt, line 17 m] · B 0.46 (20) [bolt, line 17 m] · B 0.46 (20) [bolt, line 17 m] · B 0.46 (24) [bolt, line 17 m] |
| **Red Tide** `tide` | 4 (- / - / - / 0.9) · 6–16 · 8 · ranged | N 0.5 (14) [release crescent x1] · N 0.44 (14) [release crescent x3] · N 0.44 (14) [release crescent x1] |
| **The Starless Sky** `storm` | 4 (- / - / - / 1) · 0–16 · 14 · hazard | R 0.95 (26) [cast storm x6, fixed] |
| **Void Waltz** `voidWaltz` | 4 (- / - / - / 2.8) · 0–12 · 8 · string | N 0.6 (14) [blink behind 2 m] · N 0.54 (13) [blink behind 2 m] · N 0.54 (13) [blink behind 2 m] · N 0.54 (13) [blink behind 2 m] · N 0.54 (13) [blink behind 2 m] · B 0.6 (24) [lock, blink behind 2.1 m] |
| **Thunder Between** `thunderVerse` | 4 (- / - / - / 2.4) · 0–5 · 7 · string | N 0.6 (14) · B 0.44 (18) [bolt, line 17 m] · N 0.36 (13) · B 0.44 (18) [bolt, line 17 m] · N 0.36 (13) · N 0.36 (13) · B 0.44 (20) [bolt, line 17 m] · one of { B 0.48 (22) [line 2.35 m, dash <=2.4 m] / B 0.66 (26) [lock, lift] } |
| **Hollow Crown** `hollowCrown` | 4 (- / - / - / 2.2) · 0–4.4 · 8 · string | N 0.6 (14) · N 0.42 (13) · R 0.6 (22) [blink behind 2.2 m] · B 0.5 (18) [bolt, line 17 m] · N 0.48 (13) [blink behind 2 m] · N 0.36 (13) · R 0.62 (24) [ring 3.2 m, knockdown] |
| **Crimson Eclipse** `redEclipse` | 4 (- / - / - / 1.6) · 0–6 · 8 · string | R 0.72 (22) [dash <=4 m] · R 0.72 (22) [blink behind 2 m] · R 0.74 (24) [ring 3.2 m, knockdown] · R 0.62 (26) [line 2.6 m, MIKIRI, dash <=2.8 m] |
| **Starless Night** `starlessNight` | 4 (- / - / - / 1.3) · 0–16 · 32 · hazard | R 1.2 (24) [ring 3 m, knockdown, fixed] · R 0.42 (22) [cast night, fixed] |

*Counters, flurries, ignitions* (a Riposte only from his guard or after he wins a blade lock; the
Starless Storm is his flurry; an ignition starts each form after a deathblow)

| Move | Hits |
|---|---|
| **Riposte** `riposte` | N 0.46 (15) · B 0.36 (21) [line 2.05 m, dash <=2.4 m] |
| **Riposte (twin)** `riposte2` | N 0.46 (13) · N 0.34 (13) · B 0.36 (20) [line 2.05 m, dash <=2.4 m] |
| **Riposte (staff)** `riposte3` | N 0.46 (15) · N 0.36 (14) [ring 2.95 m] |
| **Riposte (cross)** `riposte4` | N 0.5 (16) · B 0.36 (22) [line 2.35 m, dash <=2.4 m] |
| **Starless Storm** `streakFlurry` | N 0.62 (13) · N 0.48 (13) [flit] · N 0.48 (13) [flit] · N 0.48 (13) [flit] |
| **Starless Storm (2)** `streakFlurry2` | N 0.62 (13) · N 0.48 (13) [flit] · N 0.48 (13) [flit] · N 0.48 (13) [flit] |
| **Starless Storm (3)** `streakFlurry3` | N 0.62 (13) · N 0.48 (13) [flit] · N 0.48 (13) [flit] · N 0.48 (13) [flit] |
| **Starless Storm (4)** `streakFlurry4` | N 0.62 (13) · N 0.48 (13) [flit] · N 0.48 (13) [flit] · N 0.48 (13) [flit] |
| **Ignition (form 2)** `ignite2` | R 2.1 (12) [ring 6.5 m, fixed] |
| **Ignition (form 3)** `ignite3` | R 2.1 (12) [ring 6.5 m, fixed] |
| **Ignition (form 4)** `ignite4` | R 2.1 (12) [ring 6.5 m, fixed] |

The form's pool (weights summed, share by category): form 1 20 moves, 51 % strings, 29 % closers, 12 %
spells; form 2 21, 46 % strings, 23 % closers, 12 % terrain; form 3 24, 44 % strings, 21 % terrain,
13 % spells, 10 % closers; form 4 29, 41 % strings, 17 % terrain, 14 % closers, 13 % spells, 8 % hazards.

**How a string moves** (ADR-085): its cuts alternate the foot that drives them, so he walks through
it; a spin is a hop that carries the whole body round; the somersault, the cartwheel and the backflip
leave the floor (he cannot be hit by the hero's blade less for it: his hurt spheres go with him); a
main string ends with its form's flourish as he recovers (the blade rolled round the wrist, both
blades, the staff turned like a mill wheel, the cross-hilt swept down and raised): that recovery is
the opening.

Checked by `npm test` → `tests/integration/lord.mjs`: LEVEL (the set, its colliders, the boss slot,
his harness, that he waits seated), DATA (every realisation: a tell per hit, first windup ≥ 0.4 s,
blows ≥ 0.34 s apart, each flash after the blow before it, a six-hit string that varies in every
form, faster form by form), TIMING (every contact within 23 ms of its flash + 0.26 s, every move's
first hit lands), FORMS (the whole four-bar flow through the hero's own attack press), SPELLS (every
answer in the tables above, the glide, the wheeling blade, the orbit, the weather, Starless Night,
the returning blade giving way at its turn), MOVES (every new move), TERRAIN, PACE, BOUNDS (never off
the floor), FLOW (the south lip, the throne intro, a death and the reset), WIN.

**Measured (the final build, 2026-11-16; `tests/integration/lord.mjs`).** Bots, not people: **no human
has played the second pass yet.**
- **Pace** (PACE: a god-mode defender that guards and rolls and never attacks, kept to the crater; ten
  seeds (4242, 7, 99, 1337, 2024, 11, 23, 555, 808, 31337) × 120 s a form): cues a minute (min / mean /
  max) **form 1 81.1 / 85.1 / 87.1, form 2 84.5 / 90.6 / 97.9, form 3 91.1 / 100.4 / 107.6, form 4
  104.2 / 109.7 / 115.8**; before the pass 70.6 / 79.6 / 75.2 / 84.9 (form 3 was LESS busy than form 2).
  Form over form × 1.065 / 1.108 / 1.093 in the mean of the seeds; on the worst seed × 0.993 / 0.987 /
  1.016: each form is busier than the one before in the mean, and within 1.3 % of it on the worst
  seed. Longest gap between cues (max / mean) 3.22 / 2.52, 3.05 / 2.65, 2.82 / 2.49, 2.70 / 2.23 s. A
  dodge for 15 / 15 / 18 / 39 % of the cues. Conflicts 0. The fairness guard's feints per 120 s: 0 – 4
  in form 3 on nine seeds (8 on one), 0 – 7 in form 4 (most against world pieces his own blows felled,
  the rest against the storm and Glass Rain: the price of his 0.4 s rule). Where a slow seed's time
  went in form 3: to slow one-cue moves (Starfall, Nightfall, the returning blade, the Dark Star,
  Severance), not to footwork. The meter asserts each form ≥ [1, 0.93, 0.93, 0.95] × the one before on
  every seed and [1, 1.03, 1.05, 1.04] × in the seeds' mean, at least 72 / 76 / 82 / 93 cues a minute,
  no gap over 4.0 / 4.0 / 3.8 / 3.6 s.
- **Mortal bots** (whole fights, seeds 4242 / 7 / 99; `lord.mjs . probe`, opt-in; they drink below 60
  HP in his openings): the 95 % bot wins all three (64 / 79 / 63 s; on `main` 73 / 67 / 42 s); the 85 %
  bot wins two (77 s, 64 s) and dies at 49 s in form 3 on the third (on `main` it won all three); the
  70 % bot dies on all three (on `main` too). Each form ends by a POSTURE BREAK, not an empty bar:
  against a bot that parries in a frame his offence is mostly reactions (each string ends in the
  hero's riposte, then a flinch, a recoil or a reel), and the whole fight is about a minute. **The 3 – 5
  minute target is not met**; the levers are posture and health, which this pass left alone.
- **A pure defender** (95 %, never swings, drinks in his openings; `lord.mjs . defend`, opt-in; 120 s
  of play a form): alive at the end of all twelve form runs (lowest 66 HP, at most 2 flasks). On `main`
  it died in form 4 on one seed.
- **The worst blow** taken 33.0 (the Dark Star's burst; 33.0 on `main` too). **The worst second is
  worse than before: 59.4 (57.2 on `main`)**: four Wheel of Stones blows on a defender who missed one.
  That is the string-lock: one missed blow in a long string often costs the rest of it (the hero's
  stagger is 0.4 s, his blows come 0.36 – 0.42 s apart); already true on `main`, and the longer form-3
  strings make it cost more. Not fixed.
- **Not measured / not fixed:** a human's fight; a phone's frame rate; the string-lock (above); the
  hiding place behind the throne. The bots never use the blade lock or the mikiri.

## Tian Lei, the Last Ascendant (2026-11-21, ADR-129; `?level=ring`)
A bare-handed martial artist who waits, arms folded, on the Skybreak Ring, a tournament ring of stone
tiles on the open badlands: punches, kicks, elbows, knees and palm strikes, blasts of gold ki, a disc,
lightning, beams. An original character (no franchise's names, likeness, costume or moves; the lead
set aside a bare-chested look and the cupped-hands beam for that reason). The owner's brief: "phase 1
... phase 2 ... phase 3 ...", a challenger who transforms twice, and "make it feel like an anime epic
battle": speed (afterimages on every blink and dash), long knock-backs he chases down,
transformations with a pillar of light and a shock ring, a ring that is wrecked by the end, a beam
that takes the top off a butte, the light of the whole place changing with each form. He runs on the
duelist engine (the guard, the deflect chain, the blade lock, the mikiri, the full deflect, the
Ghostep, his flurry, hit stun, the director and the fairness guard are as written above and in *The
duelists' pressure and the fairness guard*, below), with these differences. Code: ARCHITECTURE.md
"Tian Lei, the Last Ascendant"; the moveset the owner approved: the lead's `MOVES.md`.

**Three forms, three bars, a deathblow each** (the Lord's structure):
| Form | Who he is | Guard | Windup × | Recovery × | Footwork |
|---|---|---|---|---|---|
| 1 | *The Challenger*: dark hair, no aura; pure martial arts and a few shots | low and wide, both fists up | 1 | 0.9 | walks in range, runs, sprints past 5.5 m |
| 2 | *Golden Ascension*: a gold flame aura, hair risen and gold; blinks, volleys, the ring starts to break | upright, the lead hand open, the rear fist at the hip | 0.93 | 0.82 | + the dash |
| 3 | *Thunder Ascension*: lightning in the aura, the hair stiffer; a storm; the longest strings, the great beam | arms at his sides, the hands open | 0.86 | 0.74 | + the closing blink |

- Each form has its own bar of 2000 HP (the boss bar shows three pips; the lead's middle of four
  measured settings, below: the owner's to set after playing). **An empty bar breaks him**, as
  a full posture meter does: on one knee for 4.5 s; an attack within 3.4 m is the **deathblow** (the
  execution, DEATHBLOW). Forms 1 and 2 end in a **transformation** (Golden Ascension `ascend2`, Thunder
  Ascension `ascend3`): 2.3 s rising from his knee as the light is drawn up through him and stones lift
  round him, then a pillar of light and a red **shock ring** (r 6.5 m, 12 damage, knockback 7: roll
  through it or stand clear) that cracks the tiles round him (and breaks those within 2.2 m); nothing
  lands on him from the deathblow until that ring goes out, and his hair, light and aura change WITH
  the ring, not before it. Thunder Ascension's ring is followed by four bolts on the ring's corners
  (a strike with its cue only on a hero standing within 2.4 m of one). The third deathblow kills him.
- A break nobody answers: he rises with 20 % of the bar back (if it was empty) and half the meter.
- **Posture, the Sekiro rule** (as the Lord's): gains × 0.45 on a full bar rising to × 1.25 on an empty
  one, recovery × 1.5 down to × 0.5 (22 / s after 2.2 s). Meter [900, 1000, 1100] by form.
- **Speed:** harder forms mean MORE PRESSURE, NOT MORE DAMAGE (the owner's standing answer): windups ×
  [1, 0.93, 0.86] (not `fixed` beats), so a string's follow-up blows come 0.34 s apart in form 1 and
  ~0.29 s in form 3; the glint 0.26 s before every impact (`flashLead`); breathers (`idleGap`) [0.1 –
  0.3, 0.05 – 0.16, 0.04 – 0.13] s, after an opening of the hero's [0.14 – 0.4, 0.1 – 0.32, 0.08 –
  0.26] s; at most [4, 5, 7] moves in a row; a red and a white cue at least 0.4 s apart (the Lord's
  rule). No white or blue blow is above 26 before `damageScale` 1.1 (the red Comet Heel 28, his one
  black move a form 36, a lost clash 40).
- **His footwork:** he walks inside striking range (2.6 m/s), runs beyond it (6.2), sprints past 5.5 m
  (9). **The dash** (from form 2): past 5.5 m he crosses the gap at 16 m/s to 2.4 m short of the hero,
  low and pitched into it, an afterimage left where he started (not more often than every 2.2 s, 9 m
  at most). **The closing blink** (form 3): past 9 m he may (one look in two, every 4 s at most)
  vanish and stand 2.4 m from the hero. He keeps to a circle of 13.8 m round the ring's centre (the
  tiles end at 15 m; the kerb is left free); there is no ring-out.
- **His moments of speed:** a blow out of a **blink** (*His ki*, below) shows a shape of him where he
  was and a streak to where he is; **a "launch"** (the hero has no air state) is a knock-back of 11 m
  with a knockdown, and his next blow blinks to where the hero's slide ends (Sky Hammer, Heaven and
  Earth).
- **THE SIGN** (the third wave, 2026-11-22; forms 2 and 3): before the first vanish of a string he
  STANDS for it: two fingers of his right hand raised to his brow, the other hand loose at his hip, the
  eyes on you (the first 0.36 s of a 0.72 s windup); a snap of light at the hand the moment he goes,
  the streak, and he is behind you (Sign Step, Vanishing Step, Storm Waltz, Mirage's first feint,
  riposte3) or at your left, your right and then behind you (Three Signs: a cross, a round kick, the
  red axe kick) with the rest of the windup and the glint still to come. The sign is the read: when the
  hand goes up, turn. A blow out of a vanish meets a guard from any side; the later vanishes of a string
  are quick, without the sign (the chain of afterimages).
- **THE COUNTER STANCE** (the third wave; one a form): Still Water (form 1: sunk, one palm high and one
  low), Golden Mirror (form 2: upright, the lead palm open at the face), Thunder Mirror (form 3: square,
  the arms low, the hands open). He stands in it 0.45 s + 0.2 - 0.4 s, light drawn INTO his open palms,
  no glint. **A cut into it is CAUGHT**: no damage, no posture, your blade thrown back (the bounce), and
  his punish comes at once (Still Water: a cross and a palm on a dash, a lock; Golden Mirror: a vanish
  behind you, the launching uppercut and the hammer where you land; Thunder Mirror: a bolt point-blank,
  then a signed vanish and the axe kick). **Wait it out and he is open**: the stance ends on nothing
  and his guard is down 0.6 s. The read: open palms with light drawn in = do not cut; his fists up = his
  guard. His ripostes out of a deflect are drawn from two a form (Riposte or a knee and a round kick;
  the golden Riposte or a vanish behind you; the thunder Riposte or a hop back and a bolt a perfect
  parry returns).

**Bare hands.** His "blade" (what the hero's parry, the trade, the blade lock and the trails meet) is
the STRIKING LIMB of the moment: the forearm of a punch, the shin of a kick, the thigh of a knee, the
upper arm of an elbow; in a guard the blocking forearm. Each beat names its limb (`part`), and the
glint and the trail are drawn on it. **His guard is his forearms** (a front arc of ±1.31 rad; the
duelist's guard rules: raised in footwork and early in a windup, a heavy blow with a full cleave's
poise crushes it). Every form has **a blade lock** (a perfect parry of a beat marked lock: Hundred
Hands' palm and Eight Gates' roundhouse in form 1, Golden Gates' and Vanishing Step's palms in form 2,
Storm Waltz's palm and Thunder Gates' uppercut in form 3; the lock is the duel's), **a perilous
thrust** (Piercing Palm, red, MIKIRI: roll INTO it and step on his arm; in all three forms) and
**one black move** (Mountain-Splitting Fist, Sunbreaker, Heavenfall). **A blow out of a blink meets
a guard from any side** (as the Lord's).

**His ki** (gold in the fire field; each is read and answered like a blow):
| Thing | Tell | What it is | Answers |
|---|---|---|---|
| **A blast** (Spirit Shot, Scatter, Blast Dance) | blue / normal | a ball of gold ki from his palm (the palm drawn back at the ribs, the lead hand sighting, then the thrust): Spirit Shot 24 m/s (22; a second from the other palm half the time), Scatter three at 15 m/s in a 28° fan (12 each), Blast Dance's point-blank shot 9 m/s and its hip shot 12 m/s; each cues itself 0.26 s before it reaches you, or fizzles if it could cue only later than 0.2 s; cover stops it; it flies 22 m, then drops and bursts | parry or block; a **perfect parry of a returnable one (Spirit Shot, the hip shot) flies it back into him: 50 damage, 34 posture**; roll. Inside Blast Dance a blast beat is a palm strike when you are within its reach |
| **Golden Rain** (forms 2, 3) | normal | ten small blasts in 1.6 s, two fans sweeping across you left to right and back, 13 m/s, 9 each; each cues itself; one may wait 0.12 s or not be thrown (the fairness guard) | parry each, or run across the fan |
| **Sun Wheel** (forms 2, 3) | red | a spinning disc thrown out to a side: it curves out 12 m at 16 m/s, hangs 0.3 s at its turn, comes home THROUGH where you stood at 18 m/s, then to his raised hand (18 each way); it cuts cover; it may hang up to 0.4 s longer, or come home uncued and harmless (the fairness guard) | roll each pass at its cue; a parry on the way out sends it home at once |
| **A bolt** (Thunder Gates, Lightning Lance; form 3) | blue | the hand raised by the ear, then the arm flung out, two fingers down a 17 × 1.7 m line of lightning | parry; a **perfect parry throws it back: 50 damage, 34 posture**; block; roll |
| **Heaven's Volley** (form 2) | red, red | he rises 4 m, arms spread; six strikes called 0.42 s apart round where you are heading (each a red ring r 2.2 m for 0.95 s, then the bolt: 22, knockdown), then the dive onto you (a ring 2.8 m, 26, knockdown, a crater); about 4.5 s in all. Nothing lands on him up there, and a strike rolled through perfectly is a plain dodge (no counter) | leave each ring or roll as it lands; roll the dive |
| **Storm Cage** (form 3) | red | eight orbs in a ring of 5 m round you, open on the side away from him; after 0.7 s they fly in one at a time 0.4 s apart at 12 m/s (20, knockdown, r 1.3 m), each cueing itself as it comes | roll out through the gap, or roll each at its cue |
| **Heaven's Lantern** (forms 2, 3; the third wave, 2026-11-22) | blue | he rises 2.5 m, both arms raised, and gathers a great orb over his palms for 1.8 s (motes drawn up off the whole ring, its light dimmed a third); both arms swept down, it is thrown at where you will be 0.3 s on, no homing: 10 m/s, a hit 2 m round it, falling from 3.6 m to chest height where you stand and on to the floor past you; it cues itself 0.26 s before it reaches you (26, knockdown, thrown 6 m); nothing else of his starts while it is out, and the weather stands down; at its range it bursts on the floor (a crater r 4) | **a parry or a block is safe** (it bursts on the guard: a crater at your feet, no second hit); a roll passes it; **a PERFECT parry starts THE PUSH** (below) |
| **Raining Suns** (forms 2, 3; the third wave) | normal, then blue | he leaps 3 m and hangs; sixteen small blasts poured down from his palms in turn in 2.2 s (8 each, 17 m/s, falling onto where you are as each is thrown; every third one on you, the others 1.7 - 2.6 m to your sides, pocking the floor), each cueing itself (one may wait 0.12 s or be skipped: the fairness guard); then the finisher, a returnable blast thrown down from the air (22), and he drops | block or parry them (a guard held through the whole pour and the finisher is not worn through); a **perfect parry of the finisher returns it: 50 damage, 34 posture**; or run: a blast lands where you were |
| **Thunderfall** (form 3, weather) | red | in his moves' pauses a strike is called near where you are heading every 3.2 s with his bar full, down to 1.8 s with it empty, at most 2 live: a red ring r 2.1 m for 1.1 s, then the bolt (22, knockdown). Never in your opening, never while a beam of his is lit | leave the ring or roll as it lands |
| **Rising Tide** (form 1) | red | a palm thrust and a beam 16 × 1.6 m lit 0.7 s. He aims through the 1.1 s windup; at 76 % of it (at its cue) the line is FIXED and a thin thread of light runs along it from his lead hand. First contact 22, knockdown, thrown 5 m along it; then 8 every 0.18 s on a hero still in it | **be off the line at the cue**: a sprint or a roll clears it, standing or running (4.6 m/s) does not; a held guard facing him pays guard only and is pushed along it |
| **Rising Tide, sweeping** (forms 2, 3) | red | 20 × 2 m lit 1.1 s; once lit it is dragged up to 40° toward the side you are on at 36°/s (first contact 24, ticks 8) | at range the answer is the ROLL through it (its edge moves 5 – 10 m/s at 8 – 16 m: faster than the hero's sprint, 7.2) |
| **Twin Tide** (form 3) | red, red | a one-palm beam 16 × 1.4 m lit 0.5 s, then the other palm's, aimed where you are heading (20 each, ticks 8) | off the first line, then do not run straight on |
| **Heaven-Splitting Tide** (form 3, the great spell) | blue (FLARE) | 14 s into form 3 at the earliest, then at most every 35 s: he vanishes to the ring's edge farthest from you; a 2.4 s charge (the light of the whole ring dims, stones rise, a short close look at him); at 80 % of it the line is fixed (its thread runs out); then both palms: a beam 26 × 3.4 m lit 2.2 s that follows you one way at 30°/s up to 40°. Its head: 26, knockdown, thrown 8 m; ticks 12 | **perfect-parry the head: THE CLASH** (below); a plain parry or a block holds it as a block; leave its line before the head (its head is not perfect-dodgeable: a roll through it is a plain dodge); a held guard pays guard only and slides ~3 m/s along it |

**The beams' rules** (`kiBeam.js`). The line is fixed at the cue, never after: from the flare the hero
has the whole 0.26 s to leave it. The drawn beam ends at a butte on its line (and its strip with it) or
at a raised guard. The FIRST CONTACT comes in the 0.1 s active window only; after it a TICK every 0.18 s
on a hero still in the strip and not knocked down: a stream (dealt in parts under the stagger floor, no
perfect dodge). A held guard facing him (his palm or him in the guard's arc) pays the tick's guard cost,
never health, and slides along the beam; the tick that would empty the guard lands as a blow and the
guard opens. While a beam is lit he starts nothing that asks a guard, and the weather stands down.

**THE CLASH.** A PERFECT parry of the great beam's head locks the beam on the hero's blade where they
stand (the blade lock at range: mash attack / guard to push the meter; start 0.5, +0.085 a press, -0.3 /
s, 3 s, won at the end if at least 0.55); the camera draws back to frame both, his two palms held out,
the beam grinding on the blade. **Won:** the beam splits past the hero and dies, his posture takes 2 × a
won lock's (2 × 110 before the Sekiro factor), the blade lock's cinematic, he REELS for 4 s (the hero
needs ~2.3 s to cross 17 m to him). **Lost:** the beam breaks through: 40 damage, knockdown, thrown 12 m
along it. The clash is never mandatory: leaving the line is always an answer.

**THE PUSH** (the third wave, 2026-11-22). A PERFECT parry of Heaven's Lantern's orb stops it on the
blade: the same blade lock at range (start 0.5, +0.085 a press, -0.3 / s, 2.6 s, won at the end if at
least 0.55; the camera frames the pair), his two palms held out, the orb grinding on the blade and
sliding toward him as the meter climbs. **Won:** the orb flies back into him: 120 damage, 220 posture
(before the Sekiro factor), and he REELS 3 s. **Lost:** it bursts on the hero: 40, knockdown, thrown 10 m,
a crater where he stood. Never mandatory: a plain parry, a block or a roll is always an answer.

**He uses the ring** (`terrain.js`, numbers `TUNING.terrain`; ADR-107's rules, the Lord's recipe).
Moves on the ring's tiles, chosen only while the floor has tiles for them (his AI weighs them 0 when
it has not, and a move with no tile does not start). Each thrown tile or bursting line cues itself on
the tile (the flare, 0.26 s before it reaches you); nothing is drawn where it lands.
| Move | Tell | What happens | Answer |
|---|---|---|---|
| **Tile Kick** (forms 1, 2) | normal | 0.8 s: he stamps, the whole tile before him jumps up and hangs at his lead hand, and his cross sends it at you at 16 m/s (16); its place is left broken | parry (it cuts the tile in two: 24 posture to him), block, roll; cover in its way stops it |
| **Ring Breaker** (forms 2, 3) | red | 0.9 s: both fists into the floor; tiles burst up in a line toward you, from 1.8 m out, one every 1.5 m (up to 9, 0.2 s apart; 0.17 in form 3) to 2.5 m past you, each with its flare on the tile for a hero near it (22, knockdown, r 1.25 m); one blow at most for the whole line | step off the line, or roll at the tile under you |
| **Stone Storm** (forms 2, 3) | normal, red | 0.95 s: his aura tears up three tiles within 5.5 m and holds them turning round him; they leave 0.42 s apart, each at you (14); then the great one (red, 26, knockdown). A stagger before a throw drops what he holds | parry / block the three, roll the great one |
| **The quake** (Heavenfall's landing, form 3) | red | his black leap comes down (36, ring 3.4 m); every tile within 6 m shatters, and a shock front runs out over the whole ring from 3.4 m to 14 m at 9 m/s, cracking each tile it crosses; it strikes you ONCE as it reaches you (22, knockdown), cued as it comes | roll through it as it reaches you (or be behind it already); a hero inside 3.4 m at the landing is the leap's own blow |

**The wear by form.** His transformations crack the tiles round him, his heavy red blows and the
dive leave craters with rubble, his beams trench their lines, his terrain moves tear tiles out: the ring
is visibly worse each form (headless: 10 → 33 → 45 % of the tiles broken by the end of forms 1 / 2 / 3,
about 30 % cracked). His terrain moves stop coming when the ring round him is spent.

**Moves** (`ascendant/moves.js` and `moves/*.js`, ADR-129). **Generated from the data** by
`docs-gen-moves.mjs` (the lead's scratchpad: `node docs-gen-moves.mjs <worktree> [--write]` rewrites the
block between the two markers below; re-run it after any change of his moves). Tells N normal, B blue,
R red, K black; a hit: `tell windup (damage) [extras]`, **windups at form 1's pace** (forms 2 – 3 ×
0.93 / 0.86, not `fixed` beats; a beam, a cast and a transformation are fixed); `one of { a / b }` = one
is drawn as the move starts; `hold` a bait hold at the cock (s); `FLARE` a blue parry moment; `LOCK` /
`MIKIRI` as Shen Hui's; `blink`: behind you, to where you land, to your side, to the far edge; `release
blast` blasts from his palm; `cast` a thing sent out (rain, disc, volley, cage; terrain: tileKick,
ringBreaker, stormThrow, stormGreat); `beam` its kind; `lit` how long a beam burns, its ticks; `thrown`
a knock-back of 5 m or more. A sector blow is the limb's reach (a fist 1.7 m, a kick 2.1 m) unless
written. Damage before `damageScale` 1.1. A move is listed under the form it first appears in;
weights per form [1 / 2 / 3] (- = not in that form); `cat` is the director's category (a move's own
`cat` or the derived one). His links: `ascendant/links.js` (`PURSUE` and `CLOSE` shared by his melee,
`AFTER_RED`, `AFTER_VOLLEY`, `AFTER_BEAM`; *The duelists' pressure*, below).

<!-- asc:moves:begin -->
*Form 1, the Challenger*

| Move | Forms (weight per form) · band m · cooldown s · cat | Hits (tell windup (damage) [extras]; `one of { a / b }`) |
|---|---|---|
| **Eight Gates** `gates` | 1 (2.6 / - / -) · 0–3.6 · 6 · string | N 0.48 (12) · N 0.34 (12) · N 0.36 (13) [sector 1.25 m, 0.4 m ahead] · one of { B 0.44 (20) [lock, hold 0.1-0.3] / N 0.34 (12) } · N 0.38 (13) [ring 2.2 m] · B 0.56 (22) [FLARE] |
| **Hundred Hands** `hundred` | 1, 2 (2.4 / 1 / -) · 0–3.2 · 8 · string | N 0.5 (9) · N 0.34 (9) · N 0.34 (9) · N 0.34 (9) · N 0.34 (9) · N 0.34 (9) · N 0.34 (9) · B 0.44 (20) [line 2.2 x 0.8 m, lock, FLARE, dash <=2.4 m] |
| **Tiger Descends** `tiger` | 1, 2 (2.8 / 1 / -) · 1.6–6 · 7 · string | N 0.5 (15) [line 2.2 x 0.8 m, dash <=4 m] · N 0.36 (12) · R 0.62 (24) [ring 2.6 m, knockdown] |
| **Iron Mountain** `ironMountain` | 1 (1.8 / - / -) · 0–4 · 8 · closer | N 0.5 (14) [line 2.2 x 1 m, dash <=3 m] · N 0.4 (15) [line 2.2 x 1 m, thrown 9 m] |
| **Meteor Step** `meteorStep` | 1, 2, 3 (2 / 1.2 / 1) · 2.6–7 · 3 · closer | N 0.5 (17) [line 2.2 x 0.8 m, dash <=5.5 m, in the air] |
| **Comet Heel** `cometHeel` | 1, 2, 3 (2.2 / 1 / 0.8) · 3.5–13 · 9 · area | R 1.1 (28) [ring 2.8 m, knockdown, leap apex 3.8 m] |
| **Piercing Palm** `piercingPalm` | 1, 2, 3 (2.4 / 1.5 / 1) · 1.6–6 · 6 · closer | R 0.64 (26) [line 2.4 x 0.7 m, MIKIRI, dash <=2.8 m] |
| **Mountain-Splitting Fist** `splitFist` | 1 (1.5 / - / -) · 2.4–9 · 10 · closer | K 1.45 (36) [knockdown, fixed, hold 0.1-0.5, dash <=7.5 m] |
| **Still Water** `stillWater` | 1, 2 (0.8 / 0.4 / -) · 0–3.2 · 10 · single | STANCE 0.45 + hold 0.2-0.4 [COUNTER STANCE (a cut into it is caught; nothing: open 0.6 s)] · N 0.46 (14) · B 0.4 (22) [line 2.2 x 0.8 m, lock, dash <=2.4 m] |
| **Spirit Shot** `spiritShot` | 1, 2 (1.5 / 0.9 / -) · 5–16 · 5 · ranged (ki `blast`) | B 0.74 (22) [release blast (returnable)] · B 0.5 (20) [release blast (returnable), 50 %] |
| **Scatter** `scatter` | 1, 2 (1.2 / 0.8 / -) · 4–13 · 7 · ranged (ki `blast`) | N 0.6 (12) [release blast x3] |
| **Rising Tide** `risingTide` | 1 (1.6 / - / -) · 4–15 · 11 · hazard (ki `beam`) | R 1.1 (22) [beam rising, line 16 x 1.6 m, knockdown, thrown 5 m, lit 0.7 s, ticks 8 every 0.18 s] |
| **Tile Kick** `tileKick` | 1, 2 (1.8 / 1.2 / -) · 3.5–14 · 9 · terrain (terrain `tileKick`) | N 0.8 (16) [cast tileKick] |

*Form 2, Golden Ascension*

| Move | Forms (weight per form) · band m · cooldown s · cat | Hits (tell windup (damage) [extras]; `one of { a / b }`) |
|---|---|---|
| **Golden Gates** `goldenGates` | 2, 3 (- / 2.6 / 1.4) · 0–3.8 · 6 · string | N 0.48 (12) · N 0.34 (12) · N 0.36 (13) · B 0.5 (20) [line 2.2 x 0.8 m, lock, blink behind 2 m] · N 0.36 (12) · N 0.34 (12) · one of { R 0.62 (24) [ring 2.8 m, knockdown] / B 0.56 (22) [FLARE] } |
| **Vanishing Step** `vanishStep` | 2, 3 (- / 2 / 1.2) · 0–12 · 8 · string | N 0.72 (14) [dash <=1.6 m, the SIGN, then a vanish behind 2 m] · N 0.58 (14) [blink behind 2 m] · B 0.66 (24) [line 2.2 x 0.8 m, lock, blink behind 2.1 m] |
| **Aura Burst** `auraBurst` | 2, 3 (- / 1.8 / 0.9) · 0–3 · 9 · area | R 0.7 (20) [ring 4.5 m, thrown 7 m, aura burst] |
| **Sunbreaker** `sunbreaker` | 2 (- / 1.1 / -) · 3–12 · 12 · closer | K 1.5 (36) [knockdown, fixed, hold 0.1-0.5, dash <=12 m] |
| **Sky Hammer** `skyHammer` | 2, 3 (- / 2 / 1) · 0–3.6 · 10 · string | N 0.48 (12) · B 0.58 (20) [knockdown, thrown 11 m] · R 0.7 (26) [ring 3 m, knockdown, blink to where you land] |
| **Sign Step** `signStep` | 2, 3 (- / 1.6 / 0.9) · 0–14 · 8 · string | N 0.8 (14) [dash <=1.6 m, the SIGN, then a vanish behind 2 m] · N 0.4 (13) [sector 1.25 m, 0.4 m ahead] · B 0.5 (22) [line 2.2 x 0.8 m, lock] |
| **Golden Mirror** `goldenMirror` | 2, 3 (- / 0.7 / 0.4) · 0–3.2 · 13 · single | STANCE 0.45 + hold 0.2-0.4 [COUNTER STANCE (a cut into it is caught; nothing: open 0.6 s)] · B 0.56 (20) [knockdown, thrown 11 m, blink behind 2 m] · R 0.7 (26) [ring 3 m, knockdown, blink to where you land] |
| **Blast Dance** `blastDance` | 2 (- / 1.3 / -) · 0–4 · 8 · string | N 0.48 (12) · N 0.36 (12) · N 0.42 (12) [release blast, line 2.6 x 0.8 m (a palm in reach)] · N 0.36 (12) · N 0.34 (12) · B 0.5 (20) [release blast (returnable), line 2.6 x 0.8 m (a palm in reach)] |
| **Golden Rain** `goldenRain` | 2, 3 (- / 1.1 / 0.8) · 6–16 · 12 · ranged (ki `rain`) | N 0.7 (9 each) [cast rain x10] |
| **Sun Wheel** `sunWheel` | 2, 3 (- / 1.3 / 0.8) · 4–13 · 10 · ranged (ki `disc`) | R 0.7 (18) [cast disc] |
| **Heaven's Volley** `skyVolley` | 2 (- / 0.8 / -) · 4–16 · 16 · hazard (ki `volley`) | R 0.9 (22) [cast volley x6, knockdown, in the air] · R 0.8 (26) [ring 2.8 m, knockdown, fixed, in the air, the dive] |
| **Heaven's Lantern** `skyLantern` | 2, 3 (- / 1 / 0.8) · 4–16 · 28 · hazard (ki `lantern`) | B 1.8 (26) [cast lantern, knockdown, thrown 6 m, in the air] |
| **Raining Suns** `rainingSuns` | 2, 3 (- / 1.2 / 1) · 4–15 · 14 · ranged (ki `barrage`) | N 0.7 (8 each) [cast barrage x16, in the air] · B 0.5 (22) [release blast (returnable), in the air] |
| **Rising Tide, sweeping** `tideSweep` | 2, 3 (- / 1.3 / 0.7) · 5–16 · 13 · hazard (ki `beamSweep`) | R 1.2 (24) [beam sweep, line 20 x 2 m, knockdown, thrown 5 m, lit 1.1 s, ticks 8 every 0.18 s] |
| **Ring Breaker** `ringBreaker` | 2, 3 (- / 1.3 / 1.2) · 3.5–14 · 10 · terrain (terrain `ringBreaker`) | R 0.9 (22) [cast ringBreaker, knockdown] |
| **Stone Storm** `stoneStorm` | 2, 3 (- / 1.6 / 1.6) · 4–15 · 11 · terrain (terrain `stoneStorm`) | N 0.95 (14) [cast stormThrow x3] · R 1.5 (26) [cast stormGreat, knockdown] |

*Form 3, Thunder Ascension*

| Move | Forms (weight per form) · band m · cooldown s · cat | Hits (tell windup (damage) [extras]; `one of { a / b }`) |
|---|---|---|
| **Storm Waltz** `stormWaltz` | 3 (- / - / 2.4) · 0–12 · 8 · string | N 0.72 (13) [dash <=1.6 m, the SIGN, then a vanish behind 2 m] · N 0.54 (13) [blink behind 2 m] · N 0.54 (13) [blink behind 2 m] · N 0.54 (13) [blink behind 2 m] · N 0.54 (13) [blink behind 2 m] · B 0.6 (24) [line 2.2 x 0.8 m, lock, blink behind 2.1 m] |
| **Thousand Hands** `thousand` | 3 (- / - / 2.6) · 0–3.2 · 9 · string | N 0.5 (9) · N 0.34 (9) · N 0.34 (9) · N 0.34 (9) · N 0.34 (9) · N 0.34 (9) · N 0.34 (9) · N 0.34 (9) · N 0.34 (9) · R 0.6 (24) [ring 3.2 m, knockdown] |
| **Heaven and Earth** `heavenEarth` | 3 (- / - / 1.8) · 0–3.6 · 11 · string | B 0.56 (20) [knockdown, thrown 11 m] · R 0.66 (26) [ring 3 m, knockdown, blink to where you land] · R 0.6 (20) [ring 4.4 m, thrown 6 m, aura burst] · B 0.5 (22) [line 2.2 x 0.8 m, FLARE, dash <=5 m] |
| **Mirage** `mirage` | 3 (- / - / 1.6) · 2–10 · 9 · string | FEINT 0.72 [the SIGN, then a vanish to your side (-1.4 rad)] · FEINT 0.5 [blink to your side (1.4 rad)] · FEINT 0.5 [blink to your side (0.2 rad)] · R 0.66 (26) [line 2.2 x 0.8 m, knockdown, blink behind 2 m] |
| **Heavenfall** `heavenfall` | 3 (- / - / 1.1) · 3–13 · 14 · area | K 1.5 (36) [ring 3.4 m, knockdown, fixed, leap apex 4.5 m, quake 3.4-14 m at 9 m/s (22)] |
| **Three Signs** `threeSigns` | 3 (- / - / 1.8) · 0–14 · 9 · string | N 0.8 (13) [dash <=1.6 m, the SIGN, then a vanish to your side (1.5 rad)] · N 0.7 (13) [dash <=1.6 m, the SIGN, then a vanish to your side (-1.5 rad)] · R 0.72 (24) [ring 2.6 m, knockdown, dash <=1.6 m, the SIGN, then a vanish behind 2 m] |
| **Thunder Mirror** `thunderMirror` | 3 (- / - / 1.2) · 0–3.2 · 11 · single | STANCE 0.45 + hold 0.2-0.4 [COUNTER STANCE (a cut into it is caught; nothing: open 0.6 s)] · B 0.48 (20) [bolt, line 17 x 1.7 m] · R 0.72 (24) [ring 2.6 m, knockdown, dash <=1.6 m, the SIGN, then a vanish behind 2 m] |
| **Thunder Gates** `thunderGates` | 3 (- / - / 2) · 0–4 · 6 · string | N 0.48 (12) · N 0.34 (12) · B 0.44 (18) [bolt, line 17 x 1.7 m] · N 0.36 (12) · N 0.34 (12) · B 0.44 (18) [bolt, line 17 x 1.7 m] · N 0.36 (13) · N 0.34 (13) [sector 1.25 m, 0.4 m ahead] · B 0.56 (22) [lock, FLARE] |
| **Lightning Lance** `lance` | 3 (- / - / 1.3) · 4–16 · 8 · spell (ki `bolt`) | B 0.78 (20) [bolt, line 17 x 1.7 m] · B 0.46 (20) [bolt, line 17 x 1.7 m] · B 0.46 (20) [bolt, line 17 x 1.7 m] · B 0.46 (24) [bolt, line 17 x 1.7 m] |
| **Storm Cage** `stormCage` | 3 (- / - / 1) · 0–16 · 14 · hazard (ki `cage`) | R 1 (20) [cast cage x8, knockdown] |
| **Twin Tide** `twinTide` | 3 (- / - / 1) · 5–15 · 12 · hazard (ki `beamTwin`) | R 0.9 (20) [beam twin, line 16 x 1.4 m, knockdown, lit 0.5 s, ticks 8 every 0.18 s] · R 0.7 (20) [beam twin (left palm), line 16 x 1.4 m, knockdown, lit 0.5 s, ticks 8 every 0.18 s] |
| **Heaven-Splitting Tide** `heavenTide` | 3 (- / - / 1.6) · 0–16 · 35 · hazard (ki `beamGreat`) | B 2.4 (26) [beam great (both palms), line 26 x 3.4 m, lock, FLARE, knockdown, thrown 8 m, blink to the far edge, lit 2.2 s, ticks 12 every 0.18 s] |

*Counters, flurries, transformations* (a Riposte only out of his guard or after he wins a blade lock; Thousand Shadows is his flurry; a transformation starts each form after a deathblow)

| Move | Hits |
|---|---|
| **Riposte** `riposte` | N 0.46 (14) · B 0.36 (20) [line 2.2 x 0.8 m, dash <=2.4 m] |
| **Riposte (knee)** `riposteKnee` | N 0.46 (13) [sector 1.25 m, 0.4 m ahead] · N 0.36 (14) |
| **Riposte (golden)** `riposte2` | N 0.46 (13) · N 0.34 (13) · B 0.36 (20) [line 2.2 x 0.8 m, dash <=2.4 m] |
| **Riposte (vanish)** `riposteVanish` | N 0.5 (13) [blink behind 2 m] · B 0.36 (20) [line 2.2 x 0.8 m] |
| **Riposte (thunder)** `riposte3` | N 0.72 (14) [dash <=1.6 m, the SIGN, then a vanish behind 2 m] · B 0.36 (22) [line 2.2 x 0.8 m] |
| **Riposte (bolt)** `riposteBolt` | B 0.5 (20) [bolt, line 17 x 1.7 m] |
| **Thousand Shadows** `streakFlurry` | N 0.62 (12) · N 0.48 (12) [flit] · N 0.48 (12) [flit] · N 0.48 (12) [flit] |
| **Thousand Shadows (2)** `streakFlurry2` | N 0.62 (12) · N 0.48 (12) [sector 1.25 m, 0.95 m ahead, flit] · N 0.48 (12) [flit] · N 0.48 (12) [flit] |
| **Thousand Shadows (3)** `streakFlurry3` | N 0.62 (12) · N 0.48 (12) [flit] · N 0.48 (12) [flit] · N 0.48 (12) [flit] |
| **Golden Ascension** `ascend2` | R 2.3 (12) [ring 6.5 m, thrown 7 m, fixed] |
| **Thunder Ascension** `ascend3` | R 2.3 (12) [ring 6.5 m, thrown 7 m, fixed] |

The form's pool (weights summed, share by category; generated): form 1 13 moves, 32 % string, 31 % closer, 11 % ranged, 9 % area, 7 % terrain, 7 % hazard, 3 % single; form 2 25 moves, 36 % string, 17 % ranged, 13 % terrain, 12 % closer, 10 % hazard, 9 % area, 3 % single; form 3 28 moves, 48 % string, 15 % hazard, 8 % area, 8 % terrain, 7 % ranged, 6 % closer, 5 % single, 4 % spell.
(Generated by `docs-gen-moves.mjs` from `ascendant/moves.js` MOVES; damage before `damageScale` 1.1; windups × 1 / 0.93 / 0.86 by form for beats that are not `fixed`.)
<!-- asc:moves:end -->

Checked by `npm test` → `tests/integration/asc.mjs`:
- LEVEL: the registry (`?level=ring` and its aliases), the set, the boss slot, bare-handed, he waits
  with his arms folded and wakes as the hero comes.
- DATA: every move in every form it is used in, both ends of every random roll: a tell and a limb
  (`part`) per hit, first windup ≥ 0.4 s, blows ≥ 0.34 s apart, each flash after the blow before it,
  damage caps (white / blue ≤ 26, red ≤ 30, black ≤ 36), compiled round its form's stance, a six-hit
  string that varies and a perilous thrust and a lock in every form, faster form by form.
- TIMING: every move from inside its band: each glint is a blow, on time.
- FORMS: three bars; a bar emptied or the posture broken → the deathblow → the transformation; the
  third deathblow kills him.
- FLARE: his parry moments, one charged blow a form, the red blows.
- BARE: bare hands: his limbs as the blade, the parry, the guard clash, the trade, the lock, the mikiri,
  the full deflect.
- ENGINE: the engine's patches (a zone off his root, hits from the air, a sustained beat, the lock at
  range).
- PACE: a god-mode defender against his AI per form: cues a minute, gaps, the mix, chains, 0 conflicts
  (the meter: `pressure.meter`).
- BOUNDS: he keeps to the ring; a hero at its edge is still in his reach.
- FLOW: the title → the ring → he opens his eyes → the duel; a death sends him back.
- WIN: a fencing bot in god mode beats all three forms.
- TRAINING: every Training situation for him plays out and shows what it promises.
- SHOTS: each answer of every thrown or called move's row (the returns, the disc, the volley, the cage,
  the corner bolts).
- WEATHER: Thunderfall: form 3, in his pauses, at most 2 live, never in the hero's opening.
- BEAMS: Rising Tide, the sweep, Twin Tide, the great beam: the cue, the first contact, the ticks,
  every answer.
- CLASH: the great beam: the vanish, the charge, the head, the clash won and lost, never mandatory.
- BEAMWORLD: a beam takes a butte's top, trenches the tiles; the great beam reaches past its 26 m.
- MOTION: each strike on his real body (the coil, the speed at impact, the reach, the chest's turn), the
  feet through a string, the follow clock on every beat.
- STRINGS: Sky Hammer, Mirage, Heavenfall, the form shown at the nova, the dash.
- TERRAIN: Tile Kick, Ring Breaker, Stone Storm on the ring's tiles: every answer; no tiles, no move.
- QUAKE: the front over the whole ring, cued as it reaches the hero.
- WEAR: the ring visibly worse each form.
- INTEG: the pieces together: trades, bolts as lightning, the beam's bar on guard moves, the links,
  resets in the middle of seven moves, a deathblow while a beam is lit, the banner, pips and music at a
  transformation; and at its end every event this level emits is in ARCHITECTURE.md's catalogue.

**What the tuning pass added to his rules** (2026-11-21; numbers in `tuning.js`, `tuningShots.js`,
`tuningBeam.js`):
- **A perfect return is worth less when it follows another:** each return (a bolt or a Spirit Shot sent
  back) within 3 s of the last deals half of it (`shots.returns { decay, window }`): Lightning Lance's
  four are 50 + 25 + 13 + 6.
- **A beam takes at most three ticks** from a hero who is not blocking (`beam.maxTicks`); the third
  throws him 4 m clear of its side, knocked down (`beam.thrown`).
- **Storm Cage:** once one orb has knocked the hero down, the rest of that cage pass over him, and so
  does an orb that leaves while he lies down; while the orbs close in he starts no other move.
- **While the disc is out** (Sun Wheel) he starts nothing that asks a guard, as while a beam is lit.
- **Thunderfall:** a strike may land up to 0.3 s after the end of the move it was called in
  (`shots.weather.past`: the next move's blows know it from the ledger and hold for it), and a mark not
  yet cued fades when he is thrown into a reaction, a break or a stagger (`fadeInOpening`): never in the
  hero's opening.
- **His flurry answered in full** breaks him outright, as every duelist's does (`flurry.posture` 1). The
  number is the share of his meter it fills: below 1 an answered flurry no longer ends a form by itself
  (measured at 0.6, below). Built, and off: it changes a rule Training teaches.
- **The director by form** (`pressure.density` [0.6, 0.7, 0.8], `bias` per category): the busier-move
  bonus is small for him, or his one-cue ki and terrain moves are weighed out (at 2.2 strings were 87 %
  of form 3's pool by weight).
- The ring's floor in form 1's dusk is one number: `FLOOR_GAIN[0]` (0.74) in `world/skybreakRing.js`.

<!-- asc:measured:begin -->
**Measured (the tuned build, 2026-11-21; `tests/integration/asc.mjs`).** Bots, not people: **no human
has played it.**
- **Pace** (PACE: a god-mode defender that guards and rolls and never attacks; ten seeds (4242, 7, 99,
  1337, 2024, 11, 23, 555, 808, 31337) x 120 s a form): cues a minute (min / mean / max) **form 1 79.7 /
  83.3 / 86.8, form 2 83.9 / 88.2 / 92.8, form 3 88.3 / 99.7 / 107.4** (before the tuning pass 85.5 /
  91.7 / 106.7 in the mean). Form over form x 1.059 / 1.131 in the mean, x 0.975 / 1.001 on the worst
  seed. The longest gap between cues 2.70 / 3.13 / 2.95 s (it was 3.94 s in form 3, over the 3.6 s cap).
  A dodge for **13 / 23 / 40 %** of the cues (the target 15 / 25 / 35; before 10 / 17 / 26); strings 51 /
  55 / 47 % of the picks; something of his lingers on the floor 2 / 7 / 51 % of the time. Form 3: 34
  holds and 1 feint by the fairness guard per run (23 / 16 before). **Conflicts 0.** Thunderfall comes
  every 4.0 s (6.0 s before; the gap setting allows 3.2 s at a full bar: his strings leave few 0.4 s
  windows). The meter asserts each form >= [1, 0.96, 0.98] x the one before on every seed and [1, 1.02,
  1.05] x in the seeds' mean, at least 76 / 80 / 85 cues a minute, no gap over 4.0 / 3.8 / 3.6 s (a lit
  beam and the great beam's charge count as busy, as a black blow's charge does).
- **The mix depends on where the hero stands** (`asc.mjs . picks`, opt-in): in form 3 a dodge is asked
  for 36 % of the cues with the hero at 2.5 m, 56 % at 5 m, 62 % at 14 m. Rising Tide in form 1: 0 / 6.9
  / 10.1 / 10.9 picks per 120 s at 2.5 / 5 / 9 / 14 m; the terrain moves 3 - 7 per 75 s from 5 m out and
  none at 2.5 m. No move is at zero picks over the ten seeds; Heavenfall (0.7 per 120 s) and Golden Rain
  (0.1 - 0.2) are rare against a hero who stays close.
- **Mortal bots, whole fights** (`asc.mjs . probe`, opt-in; ten seeds; they drink below 60 HP in his
  openings, and rarely find one under his pressure: they often die with flasks left). By bar setting
  (health a form / the posture meter by form; `flurry.posture` 1):

  | Setting | 95 % bot | 85 % bot | 70 % bot |
  |---|---|---|---|
  | 1500 / [460, 520, 600] (the first wave's) | 10 of 10, 35 / 48 / 58 s | 8 of 10, 56 / 64 / 79 s | 1 of 10 |
  | **2000 / [900, 1000, 1100] (shipped)** | **10 of 10, 35 / 66 / 94 s** | **4 of 10, 80 / 93 / 107 s** | **0 of 10** |
  | 2600 / [1500, 1650, 1800] | 10 of 10, 35 / 76 / 105 s | 3 of 10, 93 / 109 / 135 s | 2 of 10 |
  | 4000 / [2400, 2700, 2900] | 10 of 10, 35 / 108 / 166 s | 5 of 10, 93 / 118 / 159 s | 0 of 10 |

  At the shipped setting the forms last 24 / 21 / 21 s for the 95 % bot, 29 of 30 end by a POSTURE BREAK,
  and it loses 16 / 23 / 5 HP a form. **The 3 - 5 minute target is not met, at any setting:** an answered
  flurry breaks him outright whatever his bar (the engine's rule, which Training teaches), so every
  setting's shortest fight is 35 s. With `flurry.posture` 0.6 (an answered flurry fills 60 % of his
  meter) the 95 % bot's fights are 68 / 79 / 94 s at the shipped bars and no form is under ~26 s: that
  lever is built and left at 1 (it changes a rule Training promises: the owner's call).
- **A pure defender** (95 %, never swings; `asc.mjs . defend`, opt-in; ~90 s of play a form, measured at
  4000 a form): alive at the end of 10 / 10 / 8 of ten runs by form.
- **The worst blow** 39.6 (Mountain-Splitting Fist, the black blow of form 1); no white blow above 28.6.
  **The worst second** 52.8 HP (Storm Waltz, a Thunderfall strike, Storm Waltz), 50.6 for the pure
  defender (79.2 before the pass: the great beam's ticks, now capped at three).
- **Caps** (the tuning pass): a perfect return within 3 s of the last is worth half (Lightning Lance's
  four: 200 → 94 damage to him); a beam takes at most 3 ticks from a hero who is not blocking, the third
  throws him 4 m clear (sprinting with the great beam's sweep: 119 → 40 HP); once a Storm Cage orb has
  knocked the hero down the rest pass over him.
- **The beams** (BEAMS, CLASH): Rising Tide: standing or running (4.6 m/s) is hit, a sprint or a roll at
  the cue clears it; a held guard goes 100 → 49 and loses no health. The sweep's edge moves 5.0 / 7.5 /
  10.1 m/s at 8 / 12 / 16 m (the hero sprints at 7.2): at range the answer is the roll. The great beam's
  head lands 267 ms after its cue (28.6). The clash: 5.5 presses a second win it outright in 3 s, 3.7 a
  second hold it (the duel's form-3 lock: 6.7 / 4.9); won, he reels 4.6 s and the hero needs 2.3 s to
  cross 17 m.
- **The ring's wear** (WEAR): 10 / 33 / 45 % of the tiles broken at the end of each form, about 30 %
  cracked.
- **Feet** (MOTION, the drawn feet): 0.00 - 0.78 m of slide a string with his planner and the engine's
  together (the engine's alone 0.06 - 3.72 m, his alone 0.23 - 4.14 m).
- **The fire field**: the worst case staged (form 3's aura, the great beam, ten blasts, two strikes, a
  quake) 2863 of 6000 blobs; AI fights peak at about 1525.
- `npm test`: all 11 suites; Training 94 of 94 situations; `npm run build`: 2.9 MB.
<!-- asc:measured:end -->

**Not measured / not fixed:** a human's fight; a real phone (its frame rate, touch: the clash worked at
852 × 393 in the capture rig only). The dodge share is under its target (9 / 15 / 23 % against 15 / 25
/ 35 %); form 3's longest gap 3.34 s sits near its 3.6 s cap; form 1's pool is about 56 – 58 % strings
by picks; a form's bar empties quickly (the bot's fight is 49 s). Thunderfall comes about every 4 s,
not 3.2 → 1.8 s (his strings leave few clear slots). Four perfect parries of Lightning Lance deal him
200; a hero standing in Storm Cage takes 5 × 20 and a knockdown; the great beam at long range is harsh
for a sprinter. A riposte and a link can start with the AI off. His poses are not polished (the
transformation reads as a crouch until its last frame and its body is half hidden under the gather;
the beam technique barely reads at the game camera: the glow, the thread and the flare carry it; the
skirt and sash in flight unchecked; blink landings checked by eye). At the game camera the fighters
are small on the ring's floor (the lift helps a little), the disc and the cage's orbs are small, the
lost clash's surge is faint, the quake's landing is a noisy pale cloud with a faint front, Stone
Storm's held tiles are hard to see against the aura. A blast stopped by cover is untested. The three
arenas look nearly the same at the fight camera. Filmed strips were re-shot only for form 1 from the
east.

## The duelists' pressure and the fairness guard (2026-11-16, ADR-122)
The human bosses run one engine (`enemies/duelist/`: `brain.js`, `director.js`, `ledger.js`;
ARCHITECTURE.md "Duelists"), so the same rules keep them attacking and keep them fair. The owner's
answer, as for the wyrm (ADR-119): **harder means more pressure, not more damage**. Their numbers are
per boss, per phase or form (`tuning.js` `idleGap`, `chain`, `openingGap`, `pressure`; the tables of
each boss's section above).

**What keeps him attacking.**
- **Short pauses.** Between two moves he takes `idleGap` of footwork (Shen Hui 0.03 – 0.3 s, the
  Lord 0.03 – 0.3 s, shorter each phase). Against a defender who only guards he is inside a move about
  95 % of the time.
- **Combo links** (`<boss>/links.js`). When a move ends on its own, its links are read in order: the
  first whose `when` holds (where the hero is as the move ends: near, under 3.3 m; mid, under 6 m;
  far; at his front, side or behind him; backing away; guarding), whose chance passes (one per phase)
  and whose target is usable starts with no footwork between. Else the old flow roll (`chain`) may
  start the director's next pick the same way. **Both start half way through the recovery**
  (`pressure.linkCut` / `chainCut` 0.5): the first half of every recovery stays the hero's punish
  window. A linked move's first blow lands 0.7 – 1.7 s after the last blow of the move before
  (medians 0.88 – 1.05 s; 1.1 – 1.4 s when it waited for the recovery's end). A string the hero left
  can link into its far / away pursuit.
- **Chain depth and rest.** At most `chainDepth` moves in a row (Shen Hui 4 / 5 / 7, the Lord 4 / 4 / 7
  / 7), then a breather (`chainRest`, 0.15 – 0.75 s).
- **A director over the dice** (`director.js`): every move has a category (string, single, closer,
  area, ranged, spell, terrain, hazard; a move may name its own with `cat`); the same category again
  weighs less, past `maxRun` in a row much less; strings are favoured (`bias`), and so are the busier
  moves (`density`: the weight × the move's cues a second ^ k); a category absent too long weighs more
  and later is forced (the footwork goes to its range for at most 2.5 s); gap closers past 6 m; a
  ceiling on hazards alive at once (`maxLive`); a move whose answer differs from a dodge or guard due
  soon weighs × 0.1 and is never a link.

**What the player keeps.**
- **Openings keep their length.** A parry's recoil, a stagger, a reel, the trampled stumble, the
  execution and the posture break end in the old pause (`openingGap`), whatever the pace. Only a move
  that ended on its own links: one that was parried into a recoil, staggered, broken, or answered by
  the hero's flurry or counter does not.
- **Never two different answers within 0.3 s.** Two cues that need different answers (a guard or a
  parry for white and blue; a dodge for red and black) never land within 0.3 s of each other, from
  any two sources: his blade, what he threw or called, the world's falling pieces (+ 0.06 s of margin;
  the Lord keeps a red and a white cue 0.4 s apart). Two cues that ask the SAME answer may come
  closer: a held guard takes both (two guard cues 0.1 – 0.25 s apart from two sources cannot both be
  parried; seen about once in 120 s a seed with the Flying Lantern and a Wind Step).
- **A blow may hang at its cock.** If a blade blow would break that rule it waits at the cock, as an
  authored bait hold does, up to 0.5 s; its flash, its impact, the later blows and the recovery move
  with it. Read the glint, not the swing.
- **A glintless swing is a feint.** A blow no hold can clear is not thrown: no tell, no glint, no hit,
  exactly as an authored feint (never inside his flurry). A blow at risk is announced only once the
  guard clears it at its cue (its tell and its glint go out together), so a blow that turns into a
  feint was never announced; only something that appears after the tell (a world piece felled in the
  windup) can still feint a told blow (the Lord: about 8 in 100 fight-minutes; Shen Hui 0). Shen Hui
  almost never feints this way (once in 75 fight-minutes); the Lord 0 – 4 times per 120 s in form 3
  (8 on one seed of ten) and 0 – 7 in form 4.
- **A called strike may come late or fade.** A strike he calls down (a marked ring of the Starless
  Sky, the Dark Star, a halo's plate, the Rupture) waits up to 0.9 s past its time if it must, or
  fades unstruck; its ground mark (where it has one) stays honest about where. A torn stone may wait in
  his grip; the returning blade may hang longer at its turn; a thrown piece may fly up to 0.4 s longer
  or land uncued and harmless.
- **The world's falling pieces win.** Against a piece of the level falling on the hero, his own uncued
  things give way: a crescent fizzles, a stone shatters, the blade passes uncued, a kicked lantern or
  flagstone is grounded in the air.
- **Every cue is honest.** Each blow keeps its tell and its timing (`flashLead` before the impact; a
  move's first windup and a string's spacing at their floors); only WHEN it comes moves.

**What the third duelist added (Tian Lei, 2026-11-21, ADR-129).** The same rules, three more:
- **A lit beam is one long cue.** A beam beat (`sustain`) counts in the cue ledger from its impact to
  the end of its lit window as ONE interval: nothing that asks the other answer is cued inside it, and
  **while one of his beams is lit he starts no move with a blow that asks a guard** (a white or blue
  blow; `_beamBars`: weighed 0 and refused; a transformation still goes). A beam's head, a stream held
  lit, is no blow to trade with (the trade clash ignores it).
- **The weather stands down for a beam.** Thunderfall (his form-3 weather, as the Lord's Starless Sky:
  in his pauses, never in the hero's opening) calls no strike while a beam of his is lit, held in the
  clash or fading, nor during his reactions, a break or a transformation.
- **After a red thing of his, a red blow** (`links.js` `AFTER_RED`, the Lord's rule): after Sun Wheel,
  Storm Cage, Heaven's Volley, Ring Breaker and Stone Storm he follows with Meteor Step (far), Piercing
  Palm (mid) or Aura Burst (near), never a guard string inside the window of the roll that answered
  it. After his volleys at range (Golden Rain, Scatter, Spirit Shot, Lightning Lance, Tile Kick:
  `AFTER_VOLLEY`) he closes by a blink or the flying kick; after a small beam (`AFTER_BEAM`) he chases
  the hero across the ring. His `pressure.guard.sep` is the Lord's 0.4 s (a red and a white cue 0.4 s
  apart). Everything he throws, calls or stamps up is told to the ledger before its cue
  (`brain.expect`) and asks `brain.fairDelay` before it goes: a blast of Golden Rain waits up to
  0.12 s or is not thrown, a disc may hang 0.4 s longer at its turn or come home uncued and harmless,
  a tile may fly up to 0.45 s longer, Ring Breaker's line may wait up to 0.6 s, the quake's front up
  to 0.5 s; what nothing clears lands uncued and harms nobody.

**Measured** (the PACE scenario of both suites; ten seeds, 120 s a phase or form, the final build): 0
conflicts for both bosses in every phase and form (before the pass the Lord had 8 / 5 / 32 / 86 over five seeds,
mostly the Starless Sky and the Dark Star against his strings and falling pieces against his cuts).
("The final build" in the two bosses' sections is this pass's last build before `main`'s wyrm pass,
ADR-120, was merged into it. A seed replays a different fight on every build, so the same ten seeds
were run once more after that merge: Shen Hui 77.7 / 92.0 / 98.9 cues a minute by phase (the slowest
seed 74.9 / 88.0 / 94.6; the longest gap 3.24 / 2.69 / 3.24 s), the Lord 82.7 / 90.8 / 98.2 / 109.3 by
form (78.5 / 88.2 / 93.9 / 104.3; 2.92 / 2.80 / 3.32 / 2.60 s), 0 conflicts, and every phase and form
busier than the one before it on every seed: within about 2 % of the tables above.)
**Not filmed:** a feint made by the guard, a strike fading, a stone shattering on a world warning, the
blade hanging at its turn, the footwork's seek. **Not measured:** how a person reads a held blow.

## The world breaks (2026-11-15, ADR-107; the clearing breaks: 2026-11-15, ADR-119; the whole forest wears down: 2026-11-16, ADR-120; the duel arenas: 2026-11-16, ADR-122; the wall opens: 2026-11-21, ADR-125; the Skybreak Ring: 2026-11-21, ADR-129)
What stands in a level can be chipped, broken, felled, burned and thrown. In Cinderwood **the whole
clearing breaks** (the owner, ADR-119: "the terrain itself is barely destructible"), and since
2026-11-16 **the whole forest round it** (ADR-120): 664 breakables (183 before): 502 trees and 37 dead
trees out to the forest's edge (74 m; it was those within 42 m), 10 stones of the circle, 20 boulders,
26 flagstones, the loose remains of past challengers (4 long bones, 5 helms, 3 swords), and the
landmarks in pieces: the Elder Wyrm's skeleton (36: 18 ribs, 10 runs of the spine, the hip, the mast,
the fingers, the fallen wing, the skull, the jaw, two horns), the Cinder Tree (5 boughs and its trunk)
and the nest (14 ribs and the skull). ADR-120 reverses ADR-119's "the Cinder Tree and the Elder Wyrm's
skeleton stay whole"; the bonfire stays whole. **In both duel arenas everything but the
landmarks breaks** (the owner, ADR-122): the **Ashfall Courtyard** lists 456 breakables (78 before):
293 slabs of its floor (the paving, the steps and the path), 30 pillars, 4 lanterns, the stele, the
fallen lintel, the incense cauldron, the two stone colossi (two pieces each), 80 dead trees and 32
stumps out to the hero's bound, 9 boulders and the bronze bell (it only rings); the sect gate and the
bonfire stay whole. The **Obsidian Throne's crater** lists 222 (36 before): 105 floor plates (81 big
'plate', 24 'flagstone'), 25 shards of the star's glass (cover, 1.9 – 4.2 m), 27 slabs of the rim, 20
rubble stones, the stonework of the 4 vents, 35 trunks thrown down near the crater, and six stones
hanging in the air (these only chip, stop nothing and block nobody: they are there for the Void to
throw); the throne and its dais, the fallen star, the seal's glow and the bonfire stay whole. The
**Skybreak Ring** (ADR-129; the arena the owner picked, `?ring=a`, the flats) lists 579: 361 tiles of
the ring (every tile, kerb stone and plate of the octagon), 162 clay plates of the lake bed within
24 m, 14 flagstones of the path, 12 boulders, the 4 corner posts with their braziers (a brazier goes
out with its post), 6 buttes in two pieces each (a top that comes off, a foot that only chips), 4
hoodoos, 4 banners, 3 dead trees, the war drum, the judges' dais and the gong (it never breaks); the
bonfire stays whole. The other two arenas behind the switch list 602 (b, the quarry: the lowest
course of its terraces breaks, 50 blocks) and 409 (c, the crown: 17 rock spires, 4 cairns). It all
stands again when the fight resets (a death, a rest at the bonfire, the Lab's Reset).

- **Blows chip and break.** Every blow has a power. The hero: its damage / 110 (a quick cut 0.27, the
  slam 0.6, a full cleave 1.0). A duelist: damage / 40 (a cut 0.3, an overhead 0.6; red x 1.25). The
  wyrm (`TUNING.world`, tuned down 2026-11-15 when its blows flattened the clearing): 0.7 x the
  striking part's size (a claw 0.77, the charge 1.2), a stomp 0.8, a hop 1.2, the leap 1.4, the dive's
  crash 1.8, a meteor 0.7, a lava pillar 0.9; its ground blows are weaker toward their rim (x 0.4 at
  the edge, `falloff` 0.6). A piece has structure by material and size: a young pine ~0.9, a dead tree
  ~1.6, a boulder ~1.3, a pillar 1 – 2.4 (the gate's 3.2), a standing stone ~2.3. A cut bites stone
  less (x 0.7; a blow worth under 0.1 only leaves a nick): the slam and the charged cleave are blunt
  blows and bite it in full. A duelist cuts a pillar down in about ten blows, three of his heavy ones.
  Every blow leaves a mark as big as it was hard; a hard one cracks the floor, and one of power 1.2 or
  more leaves a **crater** (a rim of thrown-up earth and a charred floor until the reset).
- **The wyrm's body meets the world** (ADR-119; it replaced ADR-107's trample round its root, which
  never reached a trunk). Every frame its head, neck, body, tail, wings and legs sweep what they pass
  through, harder the faster they move and the heavier the part. A walk or a turn is a **brush**: it
  shoves and shakes a big tree and breaks the small things (bones, helms, a sapling); walking into a
  tree pushes it over in a couple of seconds; claws and feet scrape over the flagstones. A charge, a
  tail swept hard, a landing, a low flight and a thrown piece **fell** what they hit. Its wings bend
  the wood round it as it takes off and on every downbeat near the ground; a landing after a flight
  breaks stone too. **It passes through wood it can break** (it no longer stops at a trunk); stone
  and the Cinder Tree's great trunk (ADR-120) still turn it until they break.
- **Tall pieces fall.** A piece 2.2 m or taller falls the way the blow drove it (the hero's: away
  from him) in about a second, and lands on a strip as long as it is tall. **Under a piece a boss
  felled, the hero takes one red blow** (22 x its weight 0.6 – 1.3, unblockable, knocked down): the
  strip is marked in red from the moment the piece starts to go and its flash comes 0.3 s before it
  lands. Roll through it or be out of the strip. **A piece the hero fells onto a boss deals 220 x
  weight damage and 90 x weight posture**, and never hurts the hero: put the tree or the pillar
  between you and him. What a falling piece lands on is struck too. Shorter pieces shatter where
  they stand. A fall that cannot reach the hero's ground (a tree of the wall falling outward) tells
  nothing and marks nothing: there is nothing to dodge.
- **Things wear down before they go** (2026-11-16, ADR-120). A tree loses itself in stages as its
  structure drops (at 82 %, 50 % and 22 % left): its outer crown, then half of it, then it leans
  (about 0.32 rad, over 0.6 s) the way the blow drove it, and when it breaks it falls from that lean.
  A burning tree loses its crown as it burns. The skeleton comes apart rib by rib (a tail blow takes a
  third to a half of a rib), the Cinder Tree loses its five boughs first (while one stands its trunk
  takes a fifth of a blow, and the trunk turns the wyrm like stone) and then breaks to a charred
  stump, the nest loses its ribs and skull. A broken bone leaves a heap of shards (wreckage).
- **The wall** (the trees beyond 32 m of the centre, outside the hero's ground until it opens: *The wall
  opens*, below): a little tougher
  (x 1.15), it falls mostly away from the arena, and where it lands it strikes the trees behind
  harder (x 1.4 its weight), so a felled stretch tears into the wall. The wyrm reaches it although it
  fights inside the clearing: **wind** from its roars (a phase roar's front runs round the whole ring,
  58 m), the roar's shock ring, a landing, a take-off, low wingbeats, the wing buffet and its heavy
  body on the ground tears leaves off the wall and snaps boughs (never more than its second stage:
  wind alone never fells a tree); and **fire carries on** past where it lands: past the end of the
  breath, ahead of the burning pass, outward from a flame ring, ahead of a flame wall and from a shot
  that leaves the clearing, to the first wall tree on its way, which catches. **None of it touches the
  hero** (no blow, no fire on his ground, no tell; every attack is unchanged). Measured (headless, five
  seeds, 80 s a phase): the wall's front rows (32 – 46 m) worn or down at the end 37 – 57 % (mean
  45 %), 8 – 18 % by phase 1's end; falling trees struck the hero on none of the five.
- **The wall opens** (2026-11-21, ADR-125; the owner: "the outer tree border ring should slowly crumble
  and allow the dragon and player to move outside"). The hero used to be held on a circle 31 m from
  the centre and the wyrm's root on one of 24 m, whatever had happened to the trees. Now **the ground
  ends at the trees that still stand**. Until a tree of the wall is down nothing moves: the fight
  starts on the circle it always had. When one comes down (burnt through, felled, torn up), the
  ground behind it is the hero's, out to 1 m short of the next tree standing behind it; a stretch
  with nothing left standing ends 62 m from the centre. The wall is about seven trees deep in any
  direction, so it opens tree by tree. **The wyrm follows**: its root may go as far past its 24 m as
  the hero's ground goes past his 31, less 3 m at either side of a gap (a slot two trees wide lets the
  hero in and not the wyrm; its breath, its shots and its tail still reach, and what its body brushes
  at the gap's mouth comes down and widens it). **Nothing out there is shelter**: a meteor aimed at
  the hero lands where he stands, and a barrage laid over the clearing moves with a hero who has left
  it (he stands 7 m inside its rim). A wall tree that falls onto ground he can now stand on is a red
  blow again (the strip, the flash). Stumps stand in his way out there as they do in the clearing;
  trunks lie where they fell and he walks over them. The feed says once a fight that the wall is torn
  open, and the minimap draws back to keep him on it. A death, a rest or the Lab's Restore stands
  the wall up again and shuts the ground. Measured (headless, seeds 1337 / 7 / 99, 80 s a phase, a hero
  who roams 7 m inside his ground's edge): of 120 directions round the ring 33 / 21 / 52 are open by
  the end of phase 1 and 88 / 86 / 90 by the end, the furthest 51 / 54 / 51 m out; the hero's ground
  grows by 1664 / 1828 / 1415 m2 on a circle of 3019. With a gap torn 25 m deep and the hero standing
  in it the wyrm's root went 50.8 m out and it kept 78 % of its cues a minute (35 against 45).
- **The floors break** (ADR-122; `BREAK.floor`, `world/floor.js`). Each slab of the courtyard's paving
  and each plate of the crater is a breakable piece with three states that read at the game camera:
  **whole**; **cracked** (its structure under 0.8 of itself: the slab drawn split into two to four
  pieces pulled apart over a dark seam of earth, each a little tilted); **broken** (the owner's pick
  "a, rubble on earth": bare earth that prints in dim warm letters, a ragged edge, chunks of stone
  lying on it; `?floor=b` heaves the shards into a low mound). A blow's power on the floor falls off
  from its centre (full within 0.8 m, 0.35 of it at the rim) and a blow drawn along the floor (an
  edge, a dash) bites at 0.6 of it. A slab has 0.85 of structure, a crater plate 1.3: a red heavy
  blow (a ring, a knockdown), a hurled stone, a falling piece's strip and `world.impact` break the
  slab under them; a heavy blow that is not red cracks it (a second breaks it); a blade's arc cracks
  one, a few in one place break it; a level cut at waist height passes over a 0.08 m slab. The hero's
  own low sweeps and slams break floor too (about 40 % of the slabs broken against the fencing bot).
  A boss's floor moves tear whole slabs out (lift class 3: only a move that asks for floor takes
  one); a slab in his hands is a chunk about 0.85 m across (a crater plate's 1.2 x), and where it is
  thrown it leaves flat shards. Broken floor is scenery: it stops nothing and nobody trips on it.
- **The colossi come down in two stages** (`BREAK.colossus`). Each of the courtyard's two stone
  swordsmen is its upper half (chest, arms, head; structure 6) standing on its legs (4.5). Blows on
  either wear the upper half down; it topples from the cut as one falling piece (the world's rule: a
  marked strip starting 1.6 m out from the plinth, the flash; its weight 2.2 is capped at 1.3 for the
  blow: 28.6 on the hero, 286 damage and 117 posture on a boss the hero fells it onto), falling 1.4 s;
  then the legs are a tall stump that is cover and breaks in its turn, leaving the plinth. Each stage
  leaves big carved blocks (4). Shen Hui's Severed Pillar takes a colossus too.
- **A vent flares** when its ring of stones breaks (the crater's four vents burn on, with a burst of
  flame as the rim goes).
- **Wreckage is scenery you walk over** (the owner's answer, ADR-119; until then a felled trunk came
  apart where it landed): a felled tree's trunk lies where it fell, a broken stone or boulder leaves a
  rubble pile, burnt wood lies black and smoulders, a thrown piece leaves its remains where it lands,
  a colossus leaves big carved blocks and a slab torn out of a floor leaves flat shards where it is
  thrown (ADR-122; the same rule in all three levels).
  None of it has a collider: it stops nothing and blocks nobody. It lies until the fight resets; when
  too much lies at once (64 logs, 36 burnt ones, 30 rubble piles; where a level has them 48 heaps of
  bone, 12 blocks, 16 heaps of shards; fewer on a phone) the oldest sinks into the ground. A log can
  catch and burn (6 s).
- **Cover.** A piece 1.1 m or taller stops the wyrm's bullets (each takes 0.12 out of it, an orb
  three times that), a duelist's crescents and torn stones, the wyrm's batted boulder, and stands for
  the hero against the Void's lines: a bolt blasts the cover (1.5), the pull drags it down toward the
  Lord, the Crushing Dark crushes it (3), and the hero behind it is not hit. The great red stone, the
  returning blade and the wall of force go through and strike what they cross. Breath, tongues, rings,
  walls, the nova, a thrown tree and anything that comes down from the sky are not stopped. Cover is
  temporary: a standing stone stops about 17 bullets.
- **Fire burns where it lands, and wood spreads it** (ADR-119 reversed ADR-107's "it never spreads"
  for wood). Grass under the breath, a fireball, a meteor, a lava pillar, the burning pass, the dive's
  crash, a fire blow's burning ground or a firebrand catches. A grass cell burns 3.2 – 4.6 s, then it
  is ash and cannot burn again: the field burns down as the fight goes on. Grass fire does not spread.
  Standing in it costs 5 HP every 0.55 s after the first 0.45 s (blockable; never while rolling).
  Sweeping fire (the ring, the wall, the ground tongues) lights wood only. **Fire that lands is
  capped**: at most one new tree alight every ~8 s across the level (banking 3) and none while 6 burn
  (fewer on a phone); past it the wood is only scorched (a flame wall once lit 22 – 29 trees at once).
  A tree that catches burns about 7 s, burns the hero within a metre of its trunk, then falls to
  embers and leaves a stump. **A burning tree passes it on**: after 2.2 s alight it tries every 1.1 s
  to light one unburnt tree or log within 5.2 m (45 % a try), at most 7 alight at once, a level-wide
  budget of one spread every 4 s, and at most two steps from where fire landed (a blaze stays a stand,
  it never walks round the clearing). Its light is a local glow of 5 m (it was ~16 m: a yellow flood
  that buried the fire on the ground the hero must read). These caps are the clearing's: **the wall
  burns on budgets of its own** (ADR-120): fire landing there at most one tree every ~7 s (banking 2),
  at most 6 alight in the wall at once, a wall fire spreads only through the wall (one spread every
  ~12 s, banking 2, 45 % a try) and never back into the clearing. A tree that burns through leaves the
  ground black round its stump.
  Shen Hui's burning ground (from phase 2) lights the courtyard's wood; on a held guard it drains
  the guard meter instead of health (*The Ash Disciple* → *Three phases*).
- **The bosses use it.** The Ash Disciple cuts the pillar (or a colossus) you stand under down on
  you, kicks stone lanterns and levered flagstones at you, rings the bronze bell (rings of sound that
  cross the courtyard) and springs off pillars: *The Ash Disciple* → *He uses the courtyard* (ADR-111,
  ADR-122). The wyrm tears up trees and boulders and hurls them: *The wyrm uses the ground*, below
  (ADR-110, ADR-119). The Starless Lord lifts the crater's pieces with the Void, tears its floor open
  and drops a ring of its plates on you (ADR-109, ADR-122). Tian Lei stamps a tile up and punches it
  at you, bursts a line of tiles toward you, lifts three with his aura and throws them, and his
  Heavenfall's shock cracks every tile it crosses (*Tian Lei* → *He uses the ring*); his heavy blows
  leave craters and rubble, his transformations crack the tiles round him, his blasts burst on cover
  and the disc cuts what it crosses. **A beam carries on**: every 0.2 s it lit it blasts what stands
  in its strip (power 1.5, at 1.2 m: a low piece under it is spared) and on past its drawn end to 45 m
  (a butte's top on the line comes off in about 3 ticks, 0.6 s; the great beam reaches the buttes
  from the ring's far edge), cuts a trench of craters along it (a station every 1.4 m, power 0.7, the
  great beam 1.05) and lights the ground outside the ring. A butte on the line also ENDS the drawn
  beam and its hit strip there (up to 44 m for the great beam). A thrown piece of any boss shows its
  flare only, nothing where it lands; a toppled piece keeps the world's marked strip. The world's API
  for it: ARCHITECTURE.md "Destruction".
- **How much breaks in a duel** (measured, the world agent, 2026-11-16): against the fencing bot the
  courtyard ends 33 – 48 % broken over four minutes, the crater 29 – 40 % in about a minute. The
  ring (the terrain agent, 2026-11-21, headless, `asc.mjs . wear`): 10 → 33 → 45 % of its tiles broken
  by the end of forms 1 / 2 / 3, about 30 % cracked.
- **A phone budget** (`world.setQuality`, from the LOW / MEDIUM / HIGH preset: 0.5 / 0.75 / 1): fewer
  debris letters, flames, wreckage, fires and floor marks at once. The rules do not change with it.

### The wyrm uses the ground (2026-11-15, ADR-110; fast and unmarked: 2026-11-15, ADR-119)
Three moves take what stands in the clearing. The wyrm only starts one with a piece in reach, a
piece it throws is gone until the fight resets, and it never takes the tree you stand against. The
owner: "the dragon looks very unnatural when it picks up the terrain and it gives too much time for
the player to dodge. don't show exactly where the terrain will land". So: **about twice as fast from
the tell to the blow, a whole-body grab and throw, and nothing drawn on the ground** before the piece
arrives. This supersedes ADR-110 and ADR-118 for thrown pieces.

- **Uproot and hurl** (red, phase 1). One lunge to the nearest tree or boulder (no trot; at most 0.5
  s, up to 20 m), a foreleg pins the ground, the jaws clamp, a tug that holds, a heave that tears it
  out (roots and dirt burst), it rocks back onto its haunches, the neck coils back over the shoulder
  and whips: the piece leaves the jaws tumbling with the whip and flies flat and fast (0.4 – 0.68 s in
  the air) at where you are heading. **One tell at the start; no landing mark; the flare drawn on the
  flying piece 0.35 s before it lands** is the cue. One red blow in 3.4 m: roll at the flare (a roll
  at it always dodges; a perfect dodge gives the slow-mo and crits in place, never a plunge: a thrown
  tree is no body to leap onto), or keep moving. On its way it **smashes what stands in its path** (a
  tree in the way goes down and it flies on), and past the blow it skids on 2.6 m, tumbling, and comes
  apart. From the tell to the blow about 1.5 s in phase 1 (1.4 / 1.3 in phases 2 and 3; it was 2.9),
  a boulder a little longer. A throw at a hero far round its side is slower: the neck's coil is drawn
  out into a pivot of up to 0.4 s (his opening). It turns its back on you for the piece: that is an
  opening too, and a stagger or a posture break while it holds the piece makes it drop it (no blow).
- **Tail bat** (blue, **a parry moment**, phase 1). It pivots its back to a boulder, the tail cocked
  the other way, and one lash sends the boulder bursting off the ground and skimming at you (its line
  is not drawn). **Parry it** at the blue flare: you cut it out of the air (blue posture damage), and
  the counter follows when its head is within reach, as for every parry moment; or take it on the guard (it costs guard x 1.5), step 1.15 m off its line, or stand behind a
  tree or a standing stone: cover stops it and pays for it (ADR-107). The tail itself strikes nothing
  in this move; the AI does not pick it when you stand in the lash's arc. Tell to blow about 1.3 s
  (1.25 in phases 2 and 3; it was 1.8).
- **Firebrand** (red, from phase 2). A tree in the jaws (never a boulder), a breath up its trunk
  (0.42 s), then the throw, burning: the trees it smashes on its way catch. Where it lands: the red
  blow (r 4.0, a burn), the grass and wood within 4.8 m catch, and the tree's wreck burns on for 3.4 s
  within 2.9 m (4 per 0.3 s, blockable, never while you roll; not on top of the grass fire's own
  ticks). A new phase puts the wreck out, as it does the fire hazards. Tell to blow about 1.8 s in
  phase 2 (it was 3.4).

Fairness: each has one tell at its windup and one flash 0.35 s before the blow, drawn on the piece
(the flash still comes if the action is cut short after the release: the piece carries it; the body
does not spike for it). The piece the wyrm has chosen is its own: its body walking past does not
break it before the move takes it. Checked by scenario TERRAIN of `tests/integration/integ.mjs` (68
checks on the real `Destructibles` over a hand-built set): the tell and its flash on the piece (the
blow within 85 ms of flash + lead), nothing drawn on the ground before it lands, the tug and the
tear, the path smashed, the skid, the roll, the parry, the guard, cover, a stagger mid-hold, nothing
in reach (never picked; forced, it casts about and ends), the reset, Training, the tell to blow per
phase (one run: hurl 1.50 / 1.37 / 1.28 s, tail bat 1.33 / 1.25 / 1.25 s, firebrand 1.80 s in phase
2), and a 300 s fight with the AI on (one run: 5 of 55 attacks were terrain moves). **Not right yet**
(ADR-119): the grabbed tree reads from in front of the wyrm, partly from behind, poorly from beside
it; late in a long fight few liftable pieces are left and the terrain moves get rare. On the lab
stage (`?stage=lab`) nothing stands to be taken.

Checked by `npm test` → `tests/integration/world.mjs`: SETS (the courtyard 380 – 520 pieces, the crater
180 – 280), FLOOR (the three states, what cracks and what breaks a slab), COLOSSUS (the two stages),
PLACED (a piece that moves is drawn where it is), CHIP, FELL, COVER, FIRE, THROW, RESET,
GRID (the spatial grid answers as the whole list did), BODY (the walk, the turn, the charge, the
wings, the landing against the clearing), WRECK (what falls lies and is walked over), SPREAD (the
spread's limits), WEAR (the stages), WALL (the wall's toughness, its outward and quiet falls, its
fire), REACH (the wind and the fire that carries), LANDMARKS (the skeleton, the Cinder Tree and the
nest in pieces) and BUDGET (664 pieces in 228 bones, 409 with the wyrm, of 1023: the trees and
landmarks are range pieces and take none; the courtyard 443, the crater 299; a 60 s rampage costs
destructibles.update about 0.01 ms on
average and allocates nothing) (225 checks on the real forest, courtyard and throne, 2026-11-16, after the merge of ADR-120 and ADR-122). And
integ WRECKAGE: a whole AI fight on the real clearing, 80 s a phase, must leave it changed, not
flattened (`TUNING.world.meter`: 20 – 70 % of the pieces inside the hero's bound standing at the
end, at least 8 liftable as phase 3 starts, at most 9 burnt through (6 before ADR-120: the Cinder
Tree's boughs burn), and since ADR-120 30 – 75 % of
the wall's front rows worn or down at the end, at least 3 % by phase 1's end). Measured (ADR-119): a
four-minute fight leaves 47 – 60 % standing (run alone; 24 % on one seed inside the whole suite). **Not
measured:** what breakables, the spread and the wreckage do to the fights' difficulty; no human has
played with them yet.

## Current numbers (v0.6 "bullet hell", 2026-11-09; the wyrm's second pass, 2026-11-15, ADR-119)
Source of truth: `rules.js` (`DEFENSE`, `POSTURE`), `player.js` `TUNE`, `tuning.js` (with
`TUNING.pressure`), `tuningFire.js` (with `FLIGHT`), `tuningBullets.js`, `tuningTerrain.js`,
`tuningLinks.js`, `world/breakTuning.js`.
**Damage scale (v0.6):** the wyrm attacks far more often than in v0.5, so every hit it deals through
`hitPlayer` is multiplied by `TUNING.damageScale` 0.85. The damage columns of the three tables below
are the data values *before* that scale (a 20 lands as 17), as are the strings of *The whole body*.
Bullets and the ground tongues are exempt (the Bullets tables above list their final damage).
S = `SCALE` 1.875 (model units → metres).

**Player:** HP 160, 5 flasks (+70 HP, 0.85 s), roll 0.6 s (i-frames 0.04–0.4 s), backstep 0.4 s
(0.03–0.22 s), the moveset above. Parry window 0.22 s (perfect within 0.08 s: a bullet returns),
re-arm 0.25 s (skipped right after a deflect), perfect-dodge window 0.2 s, slow-mo ×0.3 for 0.6 s, crit window 2.2 s at ×1.8 (1.6 s until Session 25; kept at 2.2 s when the chain sped up again, ADR-075).

**The wyrm:**
- HP 4500. Phase gates at 66 % (2970 HP) and 33 % (1485 HP).
- Per phase [P1, P2, P3]: windups and recoveries × [1, 0.82, 0.7] (v0.6: [1, 0.85, 0.78]; the
  swings, the flights' airborne parts, the nova's charge and the transition roars keep their
  timings); turn [70, 110, 125] °/s inside attacks, × [1.15, 1.1, 1.05] between them; walk [3.6, 4.6,
  5.3] m/s (v0.6: [3.0, 4.1, 4.6]); idle gap [0.25–0.5, 0.25–0.5, 0.05–0.25] s, but the old [1.0–1.7,
  0.7–1.2, 0.35–0.7] after the hero's openings (v0.5: [1.3–2.1, 0.9–1.5, 0.4–0.8]); links in a row
  [3, 3, 5], then a breather [0.7–1.0, 0.8–1.1, 0.4–0.65] s; ambient cinders every [–, 1.4, 0.7] s;
  posture max [560, 640, 720]; crack glow [0, 0.5, 0.8]; body embers [0, 22, 50] / s. The director's
  numbers: *Three phases* above and ARCHITECTURE.md "The director".
- Posture (`POSTURE`, unchanged since v0.2): parry 26 / 48 (normal / blue), weapon hit 5 / 16
  (light / heavy, ×1.25 on the head), regen after 3 s at 14 / s, break 3.2 s with ×2.2 crits. The
  plunge adds 40. A near-perfect defender breaks it about every 30–60 s.
- The plunge 90, the execution 260 (final damage). Reactions 1.35 s / 2.0 s (+ ~0.6 s fall in the air).
- Weapon-hit part multipliers: head 1.5, neck 1.15, body 1, tail 0.8, wing 0.9, leg 1.
- Opening cooldowns after the intro: breath 5, fireball 4, charge 3, leap 8 s (v0.6: 7, 5, 4, 10).
  A new phase's abilities: 1.5 + 1.6 × i + 0–1.5 s (v0.6: 2 + 2.5 × i + 0–2; random order; the nova
  opener is not delayed).

**Single attacks** (N normal, B blue, R red; P1 times; weight = AI weight, per phase where an array):

| Attack (phase ≥) | Tell | Windup / active / recovery (s) | Damage | Weight / cooldown | Notes |
|---|---|---|---|---|---|
| Bite (1) | B | 0.75 / 0.2 / 0.8 | 24 | 1.5 / 1.2 | |
| Claw swipe (1) | N | 0.8 / 0.25 / 0.7 | 20 | 1.6 / 1.6 | foreleg rake (was 2.6) |
| Tail sweep (1) | R | 0.9 (≥ 0.76) / 0.45 / 0.9 | 32 | 2.4 / 2.5 | spin 200°; the windup floor keeps it after its flash in P3 |
| Stomp (1) | R | 1.0 / 0.15 / 1.0 | 34 | 1.4 / 3 | ring r 4.5 × S |
| Fire breath (1) | N, blockable, not parryable | 1.1 / 1.8 (P2+ 2.4, sweeping 70°) / 1.0 | 5 per 0.15 s + burn | [1.0, 1.2, 0.7] / 8 | AI band 4.5–16 × S; the braced body (*The whole body*); was [2.2, 2.64, 2.64] |
| Fireball (1) | N | 0.9 / 0.35 (P2+ 0.9: 3 shells) / 0.9 | 22, r 3 m | [2.5, 3, 3] / 6.5 | |
| Charge (1) | R | 0.9 / 1.0 / 1.1 | 36 | 2 / 6 | |
| Leap slam (2) | R | 0.8 / air 1.8 / 1.2 | 40, r 6 × S | [0, 0.9, 0.5] / 13 | was 1.8 |
| Roar ring (transitions) | R | 1.2 / 1.6 / 0.6 | 12, r 7 × S | never picked | |

**Strings** (hits: tell; P1 windup / active / impact s; damage):

| String (phase ≥) | Hits | Recovery / cooldown | Weight [P1, P2, P3] | AI band (× S from the root) |
|---|---|---|---|---|
| Claw combo (1) | claw (N; 0.8 / 0.25 / 0.15; 16) · claw (N; 0.55 / 0.25 / 0.15; 16) · lunge bite (B; 0.6 / 0.24 / 0.05; 22) | 1.0 / 5 | [1.8, 1.2, 0.9] | 2.4–5.4, ≤ 0.9 rad off the nose |
| Rending flurry (1) | claw (N; 0.75; 16) · claw (N; 0.45; 16) · overhead claw (B; 0.62 / 0.24 / 0.22; 22) · lunge bite (B; 0.55 / 0.24 / 0.05; 24) | 1.1 / 7 | [1.8, 1.4, 1.2] | 2.4–5.4, ≤ 0.9 |
| Hesitant maw (1) | reared bite (B; 0.85 + hold 0.25–0.9 / 0.2 / 0.06; 24) · 50 %: quick bite (B; 0.5 / 0.2 / 0.06; 20) | 0.9 / 6 | [1.5, 1.6, 1.4] | 3.5–6.5, ≤ 0.65 |
| Wing buffet (1) | wing slam (N; 0.8 / 0.3 / 0.25; 18, kb 5) · pivot + the other wing (B; 0.9 / 0.3 / 0.25; 22, kb 7) | 1.0 / 6 | [1.8, 2.0, 1.8] | 6.8–8.3, any side up to 2.6 rad |
| Tail lash (2) | claw (N; 0.75; 18) · pivot + tail lash (R; 1.0 / 0.36 / 0.245; 26) · tail sweep (R; 0.9 / 0.45 / 0.2 + flank 0.1; 30) | 1.0 / 8 | [0, 2.6, 2.4] | 2.4–5.4, ≤ 0.9 |
| Pounce (2) | a hop onto the hero (R, r 3.3 × S; 0.8 / 0.6 / 0.6 = the landing; 30, knockdown) · bite (B; 0.57 / 0.2 / 0.06; 22) | 1.0 / 7 | [0, 2.2, 2.4] | 6–13, ≤ 1.0 |
| Storm flurry (1) | claw (N; 0.75; 13) · claw (N; 0.42; 13) · wing scythe (N; 0.55 / 0.4 / 0.27; 15) · overhead claw from his side (B; 0.6 / 0.24 / 0.22; 18) · lunge bite (B; 0.55 / 0.24 / 0.05; 20) | 1.1 / 9 | [1.6, 1.6, 1.6] | 3.0–5.4, ≤ 0.9 |
| Cinder flurry (2) | claw (N; 0.75; 14) · claw (N; 0.45; 14) · bite (B; 0.55 / 0.2 / 0.06; 20) · overhead claw (B; 0.62 / 0.24 / 0.22; 18) that scatters 4 embers (see Bullets) | 1.5 / 11 | [0, 2.0, 2.2] | 2.4–5.4, ≤ 0.9 |
| Frenzy (3) | claw (N; 0.75; 16) · claw (N; 0.5; 16) · bite (N; 0.55; 18) · 60 %: wing scythe (N; 0.5 / 0.4 / 0.27; 16) · a delayed claw from his side (N; 0.5 + hold 0.3–0.75; 18) · bite (B; 0.55; 24) · stomp (R; 0.85; 36) | 1.2 / 12 | [0, 0, 1.8] | 3.0–5.4, ≤ 0.9 |

The Black maw (1; [1.1, 1.3, 1.2] / 14): *The flare, the counter and the charged blow*. The seven
strings of the whole body (Wing rend, Pivot lash, Rear guard, Sky hammer, Furnace maw, Cinder rake,
Cataclysm): *The whole body* above. The Tail lash is unchanged.

**Fire attacks** (`tuningFire.js`; every blow red; sizes in world metres):

| Ability (phase ≥) | P1 timing (s) | Damage | Size | Weight [P1, P2, P3] / cooldown | AI gate |
|---|---|---|---|---|---|
| Hunting flight `skyHunt` (1) | windup 1.0 · takeoff 0.75 · pass 1.6 · wheel 1.15 · hover 0.95 · dive 0.5 · recovery 1.3 | the pass's front 26 + burn 2, kb 4, its strip 4 per 0.25 s; the dive 34, knockdown, kb 7 | strip 4.6 m wide from 9 m out, 22–36 m along the line, burns [2.5, 3.2, 4.5] s; dive r 7.5 | [0.9, 0.25, 0.15] / 24 | 7–34 m |
| Furnace flight `skyFurnace` (2) | windup 0.85 · rise 0.95 · barrage [3, 3, 4] shells [0.6, 0.6, 0.55] apart, each heated 0.4 s before its spit · swoop 0.65 · pass · wheel · hover [–, 0.8, 0.7] · dive · recovery 1.2 | shells 15, burn 1.2, kb 2.5, ≤ 2 hits; pass and dive as above | shells r 3.2 (9 m up, 12 m beside you) | [0, 1.1, 0.2] / 17 | 0–40 m |
| Cataclysm flight `skyCataclysm` (3) | windup 0.8 · pass · wheel · barrage · swoop · pass · wheel · hover 0.7 · dive · recovery 1.1 | as above | as above | [0, 0, 1.2] / 18 | 7–36 m |
| Burning pass `skyStrafe` (1) | windup 1.0 · takeoff 0.75 · pass 1.9 (7 m up) · land 1.05 | front 26 + burn 2, kb 4; the burning ground 4 per 0.25 s (blockable) | strip 4.6 m wide from 10 m out to 3 m short of the landing (24–40 m along the line), burns 2.5 s | [0.1, 0.15, 0.1] / 16 (was [0.9, 1.4, 1.2]) | 7–34 m |
| Sky dive `diveBomb` (2) | windup 0.8 · climb 1.1 · hover 1.2 (13 m up, 9 m beside the target; the tell) · dive 0.5 · recovery 1.4 | 34, knockdown, burn 1, kb 7; a perfect dodge may plunge | r 7.5 | [0, 0.2, 0.15] / 15 (was [0, 1.6, 1.4]) | any distance |
| Hover barrage `hoverBarrage` (2) | windup 0.8 · rise 1.0 (9 m up, 13 m beside you) · 3–5 shells 0.5 s apart, each heating its ground 0.4 s before its spit · land 1.2 | 15 each, burn 1.2, kb 2.5; ≤ 2 hits | r 3.2 | [0, 0.4, 0.1] / 13 (was [0, 1.4, 1.2]) | any distance |
| Armageddon `meteorRain` (2) | windup 1.4 · salvo 1.6 · recovery 0.9; the sky answers 0.8 s later, waves 1.6 s apart (0.12 s between impacts), the ground heating 1.5 s (led 1.2 s) under each, a 0.9 s visible fall; the great meteor 1.2 s after the last wave (a 2 s warning) | 20 each, burn 1.5, kb 3; ≤ 4 hits; the great one 34, kb 7 (not capped); P3 craters 4 per 0.25 s for 2 s (blockable) | r 3.4 (great r 7); 3 × 8 (P3 5 × 10) over the whole clearing, every 3rd led onto you, a wave covers ≤ 45 % within 12 m of you | [0, 1.6, 1.8] / 28 | not while a barrage or meteors fall |
| Fire eruptions `eruptions` (2) | windup 0.9 · slam 0.2 · recovery 1.5; pillar k erupts 0.65 + 0.11 k after the slam | 20, burn 1.2, kb 4; each pillar's pool 3 per 0.25 s (blockable) | r 2.4; ≤ 9 pillars 3.4 m apart from 5.5 m out to 7 m past you; pools r 1.9 for [–, 2.2, 3.2] s; P3 chase (60 %): a pillar under you every 0.42 s for 3 s, each ringing 0.7 s, ≤ 2 hits | [0, 0.9, 1.8] / 11 | 6–28 m, ≤ 1.3 rad |
| Flame ring `flameRing` (2) | windup 1.1 · cast 0.25 · [1, 2, 3] rings 0.95 s apart · recovery until the last ring has run (≥ 1.85) | 24, burn 2, kb 4 | from 3 m round the wyrm to 20 m at 10 m/s, band 2.2 m | [0, 0.9, 0.7] / 12 | ≤ 14 m |
| Flame wall `flameWall` (3) | windup 1.2 · cast 0.3 · P3 a second wall 1.2 s later from your side, square to the first · recovery until the sweep ends (≥ 3.15) | 28, burn 2, kb 5 | 40 m long × 2.4 m thick, springs up 4 m ahead, sweeps 30 m at 10 m/s | [0, 0, 0.7] / 14 | any |
| Inferno nova `nova` (3) | charge 2.5 in every phase · blast 0.45 · recovery 1.6 | 70, knockdown, burn 3, kb 10; a perfect dodge may plunge | r 22 | [0, 0, 0.35] / 32 | also the P3 opener |

**Terrain moves** (`tuningTerrain.js`, ADR-110, ADR-119; sizes in world metres; picked only with a
piece in reach; no landing mark: the flare on the piece):

| Ability (phase ≥) | Tell | P1 timing (s) | Damage | Size | Weight [P1, P2, P3] / cooldown | AI gate |
|---|---|---|---|---|---|---|
| Uproot and hurl `hurl` (1) | R | a lunge to the piece ≤ 0.5 (up to 20 m at ≤ 24 m/s; no tell yet) · bite 0.3 · lift 0.3 (it tears free 45 % into it) · aim 0.18 (a pivot of ≤ 0.4 more for a hero far round its side) · whip 0.16 (released at 50 %) · flight 0.4–0.68 · recovery 0.55 | 30, knockdown, kb 5; a perfect dodge never plunges | r 3.4; on the world 1.0 where it lands, 0.9 on what it smashes in its path; skids 2.6 m | [2.6, 2.6, 2.4] / 15 | a tree or boulder within reach of one lunge, not one you stand against (2.6 m); you 5–36 m away (× 0.7 under 9 m) |
| Tail bat `tailBat` (1) | B, flare | pivot 0.6 (≥ 0.5) · lash 0.3 (the tail meets the boulder ~0.16 in) · the boulder at 26–42 m/s (re-timed to land on its flash) · recovery 0.6 | 26, kb 5 | a line 1.15 m either side, 7 m past you; cover stops it (it takes 1.0); it bursts r 2.0 | [2.6, 2.6, 2.4] / 12 | a boulder 6–15.5 m from its root, 7–32 m from you, its line clear of the wyrm's body, you out of the lash's arc |
| Firebrand `fireBrand` (2) | R | as the hurl, with 0.42 of kindling between the lift and the aim · flight 0.42–0.7 · recovery 0.6 | 32, knockdown, burn 2, kb 5; the wreck 4 per 0.3 s for 3.4 s (blockable) | r 4.0; the wreck r 2.9; grass and wood catch within 4.8 m; what it smashes in flight catches; on the world 1.4 (smash 1.2) | [0, 2.2, 2.6] / 19 | a tree (wood only), as the hurl |

**AI pick shares** (measured for v0.5; not re-measured since: the director, the links, the new strings,
patterns and flights changed them entirely; ADR-119's PRESSURE numbers, *Three phases*, are the
current measure). v0.5: P1 strings ~60 %, bite / stomp ~40 %; P2 strings ~39 %, fire and flights ~35 %,
singles ~25 %; P3 strings ~42 %, fire ~41 %.

**Difficulty (measured, ADR-033).** Integration bots (`tests/integration/integ.mjs`): `win` is a
god-mode defender that answers every tell; the opt-in `probe` is a mortal bot that answers a share
of them (`ABYSS_SKILL`, default 0.8; `node tests/integration/integ.mjs . probe`) and fights until it
wins or dies. The v0.5 probe runs were at 4200 HP, before the last bump to 4500 (+~7 % fight length);
the v0.6 runs are one run each at 4500 HP (the sims are seeded, but one run is one sample).

| Bot | v0.5 (before the bullets) | v0.6 "bullet hell" (this build) |
|---|---|---|
| probe, 95 % of tells | wins in 145–150 s | wins in 134 s; took 110 of 160 HP (worst hit 20), 57 parries, 30 deflect chains, 15 perfect dodges, 9 plunges |
| probe, 85 % | wins 1 of 3 (129 s), dies 2 of 3 | dies at 122 s with the wyrm at 4 % HP (P3 reached at 99 s); 46 parries |
| probe, 70 % | always dies | not re-run |
| `win` (god mode) at 4500 HP | 157.5 s; P2 at 51 s, P3 at 91 s; 44 of 46 parries, 26 deflect chains (longest ×5), 24 plunges, posture breaks at 25 s and 87 s | 177 s; P2 at 60 s, P3 at 103 s; 77 of 82 parries, 39 deflect chains (longest ×5), 14 Ghosteps, 17 plunges, posture breaks at 24, 56, 100 and 136 s; 104 tells |

Reading: the bots land where they did in v0.5 (95 % wins, 85 % is on the edge), and the `win` bot parries
1.75× as often (77 against 44). The `win` fight is ~20 s longer because bullet patterns are time the wyrm is
not in sword reach. The bots do not cut bullets and heal poorly, so the probe's death rates are
pessimistic. Target: 3–5 min for a player who knows the moves, several deaths while learning it.
**A human playtest is still needed**: a bot answers a flash in a frame; whether a person can read
a phase-3 ember storm is not something these runs show. The `win` and `probe` runs above were not
repeated after the second pass (ADR-119); its measure is the PRESSURE scenario's bots (*Three
phases*: 95 % wins all three runs, 80 % dies in all three).

## Earlier numbers (v0.2 "approachable RPG" … the reference match) — superseded
*Superseded 2026-11-09 by "Current numbers" above: HP 1500 → 4500, one phase gate at 50 % → three
phases, every attack's damage, the posture meter (120 / 140 → 560 / 640 / 720), the claw combo (now
a string). The geometry and timing measurements below (reaches, AI ranges, first contact against
the flash) still describe the single attacks; they are kept as history.*
- Player: HP 160, 5 flasks (+70 HP), roll 0.6 s with i-frames 0.04–0.4 s, light combo 30/32 + slam
  66, charged cleave 70–110 by charge (moveset table above).
- Cinder Wyrm: HP 1500, see `src/entities/dragon/tuning.js` for every attack's tell and timings.
  Size ×1.875 (`SCALE`): reaches, radii, hurt spheres and AI ranges scale with it, windups / tells
  / flash timing do not. v0.4 four-legged rebuild (docs/art/dragon.md): every ability keeps its
  name, tell, windup, flash timing and damage; who does the work changed, so the 3D swings were
  re-measured against the (unscaled) hero in the integration sims (model units from the root):
  - bite: the short S-neck (3.2 chain from a neck base 1.7 ahead of the root) lands it 3–6.5 out
    (was 3.7–8.4 with the wyvern's long neck); head snap 18/s, snout sphere 1.05 × SCALE.
  - swipe: now a FORELEG rake (paw sphere 1.1, wrist 0.8, forearm 0.75 × SCALE; 0.5 forward
    lunge) landing 2–5.5 out from ~23° to ~77° off the nose (2.75–5.5 beyond ~66°: right beside
    the shoulder the paw passes over the hero); the claw combo's three hits all land 3–5.4.
  - stomp: rears up on the hind legs (`pose.rear`: both forefeet leave the ground), slams the
    forefeet down onto (±1.2, 0, 2.9); the slam ring is unchanged (centre 2.9 ahead = between the
    two landing paws, r 4.5). Its tell part is 'forefeet' (the red flash bursts at both paws).
  - The hero is kept out from under the belly by a loins body circle (1.15 × SCALE) between the
    chest and hips circles; each planted foot adds a 0.45 × SCALE circle.
  - Stage 2 (attack performances per docs/art/dragon.md §5) re-measured in the sims / Lab:
    `MOUTH_Z` 5.8 → 4.3 (the short neck spits from ~4.3 ahead), `CHARGE_REACH` 7.15 → 6.8 (snout
    ~5.65 ahead during the run + its 1.15 sphere; the head goal now leads by the run speed so it
    doesn't trail behind the chest), tail sweep `reach` 9.6 → 9.5 (the 16-segment tail's tip
    reaches 8.9 in the spin + its 0.45 sphere + the hero's radius). Every AI pick of bite / swipe /
    claw combo / tail / stomp lands in the coverage probe, and each hit lands close to its
    `combat:flash` + `flashLead` across the picked distances (integration verifier, AI start path,
    1–10 model units × 0–360°, both phases: bite −17…+67 ms, swipe −50…+33, claw combo −17…+33,
    stomp 0, charge 0…+17, tail −83…+83). Timings, tells and damage unchanged.
  - Tail sweep windup fix (verifier): the windup curled the tail back toward the player
    (`tailCurl` = `dir` × 0.06, against the body's 0.35 rad backswing), and with the new resting
    hook its tip lay over a hero standing straight behind, so the sweep landed on the first active
    frame, up to 0.2 s before flash + lead (−200 ms AI path, −217 ms Lab path; v0.3 had −133 /
    −67). It now coils away from the player (`tailCurl` = −`dir` × 0.06, the same side as the
    backswing and the spin's trailing curl): −83 ms worst (AI path), −67 ms (Lab path).
  - Look fix round 1 (no gameplay number changed): the wing forearm is 2.6 model units (was 2.05)
    and the resting wings are mantled HALF in both phases (wrists ~7.5 up, ~14 m), so the two wing
    hurt spheres (wrist, finger-1 knuckle) sit higher and further out; they were already above the
    hero's sword band, and every melee band / AI range re-checks unchanged in the sims.
  - Reference match (2026-11-08; no timing, tell, damage or reach number changed; ADR-024): the
    hero's attack active frames are bit-identical to v0.4's poses (192 hit-tested frames compared);
    the wyrm's attack spheres stay within a few cm on their active frames (round 2 vs round 1 within
    4 mm, the rake paw 2.3 cm). First contact is identical for bite, claw combo and charge probes;
    three swipe placements that missed in v0.4 now land (+33 ms); the tail sweep's median contact is
    −50 ms (v0.4 −58.5) and it no longer lands before its red flash (0 of 24 probes; v0.4: 5). Hurt
    volumes that moved: the arched resting tail lifts its first spheres to ~3–4.5 m (a hero behind
    the wyrm hits hips and legs more, the tail less); the resting head (lower, on the painting's S)
    keeps its sphere above the sword band (bottom ~5.9 m vs ~4 m). The 1.3× drawn head, the longer
    distal finger bones and the thicker drawn tail are visual only.
