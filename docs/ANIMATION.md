# ABYSS animation guide: poses, motion and combat feel

Read this before you animate anything: a hero swing, a boss beat, a dodge, an idle, a hit reaction. It
collects what published animators and combat designers say makes game motion read well, and turns it into
rules for this engine (`player/anim.js`, `player/swings.js`, `player/feel.js`, the bosses' move data in
`enemies/*`, the shared duelist engine). Numbers come from the sources at the end. Lines marked
**(ours)** are this project's own conclusions or the owner's calls, not something a source says.

Related docs: `COMBAT.md` (tells, windows, balance), `STYLE.md` (the look), `ARCHITECTURE.md` (contracts),
the long authoring notes at the top of `src/entities/player/swings.js` (the key format, the coil, the
whip, the free hand).

---

## 0. Why copying reference footage failed (ours)

Four tries at animating from reference films (2026-11, ADR-236) all came back "stiff" or "meh", and the
owner scrapped the approach. Do not bring it back unless the owner asks. The research explains why it fails:

- **Copying gives every joint the same timing.** Frame-by-frame poses carry the source's timing evenly. They
  lose the hand-keyed breakdown, the eases that favour the ends, and the holds. Those are exactly what make
  motion read (sections 2 and 3).
- **Real motion reads too small and too slow on screen.** Animators push poses, holds and stretch past
  reality, and keep that level the same across the cast (Cooper). A tracked pose is real-sized.
- **The camera eats it.** The hero is ~34 px tall at 720p, seen from ~58° above and behind. Motion toward or
  away from the lens, small wrist turns and an upright blade nearly vanish. A pose that reads in a side-on
  film can be a blob from our camera.
- **A tracker gets the wrong things right.** It gets joint angles roughly right. It misses what the eye
  reads: the silhouette, the line of action, where the weight is, the gap between arm and body.

So: **author poses by hand, for our camera, and judge them on films of our own game.**

---

## 1. The workflow

1. **Pick the contact frame first.** Know when the blade lands and how long the move is from the move's
   tuning (`windup / active / recovery / chain`, `combos.js`, a boss's beat). Timing comes before poses.
2. **Block three key poses: anticipation, contact, follow-through.** If those three don't read as a
   solid shape at the game camera, no polish will save the move (Cooper; Cartwright; the Moss 2 breakdown;
   Riot's Xayah).
3. **Add the breakdown pose by hand.** The pose between two keys decides the arc and what leads or drags.
   Do not let Catmull-Rom, slerp or IK invent the path (AnimSchool; Williams). In `swings.js` the coil at
   u = 1, the mid-cut key at u ≈ 1.5 and the finish at u = 2 are the keys. The body-only anticipation key
   (u 0.5–0.8) and overshoot key (u 2.1–2.15) are the breakdowns.
4. **Set the spacing.** Ease shapes per move, holds and overshoots (section 2).
5. **Layer the overlap.** Stagger the chain (section 3).
6. **Film it at the game camera, at full speed, in a loop.** Also check it from all four sides and close up
   (section 8). Measure, don't eyeball (arm snaps, hand speed, pops).
7. **Show the owner one narrow change at a time**, on film at the game camera, against what ships today. A
   taste call gets 2–3 graded options, not one. **(ours)**

Change only what the owner named. A pass that "improves" everything at once loses what already worked
**(ours: the attack-pace and combo history)**.

---

## 2. Timing and spacing

**Timing is frame count; spacing is where the in-betweens sit.** The same punch over 2 frames reads far
faster than over 5 (Cooper).

- **Favour the ends.** Bunch the motion next to the poses the eye should feel, and leave big gaps in the
  fast middle. In code: a non-linear ease per segment, with the breakdown off the midpoint (t ≈ 0.3 or
  0.7, not 0.5) (Williams' spacing charts).
- **Choose the curve per move.** A sword that is at full speed at once reads light. Give a cut a fast in
  and a slow out, so the weight shows in the follow-through (Cooper). `feel.js` sets the clock inside each
  phase: snap, flow, weight.
- **No dead stops on every key.** Easing in and out of every key stops the motion at each one, which
  reads robotic. Pass through keys with Catmull-Rom or Hermite tangents, and ease only into a pose you mean
  to hold. For a spatial path such as a hand target, centripetal Catmull-Rom (α = 0.5) never makes cusps or
  loops (Yuksel et al.). `swings.js` already runs through its keys. Two keys close together with the same
  value make a hold. One coil key, not two: two made a hitch in the chain **(ours)**.
- **Hold the strong poses, and keep them alive.** Hold the finish of a cut so the player sees it ("plusing";
  Cooper). Heavy weapons hold longer. Make it a moving hold: a small drift, a breath, a settle, never a frozen
  frame (Animation Mentor).
- **Overshoot, then settle.** One frame past the target and back adds snap (Cartwright; Slynyrd). Sharper
  moves get bigger overshoots. In `swings.js` this is the body-only overshoot key: hips and chest
  0.08–0.14 rad past u = 2, 2 cm deeper. **Never overshoot `h` / `a`**: the blade's own follow-through is the
  hand's **(ours)**.
- **Settle in stages.** Don't end a big move on one frame. Let parts arrive at different times, and settle
  the root one axis at a time: height first, then sideways (Cooper ch. 4).
- **Uneven beats even.** Hold the extremes longer than the in-betweens. A run bob of 1, 1, 2 px reads better
  than a sine (Slynyrd 55).

**Reference frame budgets (Slynyrd, top-down, 6 frames per attack):**

| weapon | anticipation / smear / smear / smear / follow-through / recover | total |
|---|---|---|
| sword | 100 / 50 / 50 / 50 / 100 / 50 ms | 400 ms |
| spear | 200 / 50 / 50 / 50 / 150 / 50 ms | 550 ms |
| hammer | 250 / 50 / 50 / 50 / 300 / 100 ms | 800 ms |

Heavier weapons get longer holds on the anticipation and the follow-through, not a slower strike.

**The owner's pace (ours):** 0.25 s per light hit was too fast and 0.42 s too slow. Combo A ships with a
~0.09–0.10 s windup, ~0.1 s active, ~0.28 s recovery. Try a pace in the Lab (the `atk` slider) before you
change it.

---

## 3. Overlap: what fixes "stiff"

The owner's word "stiff" means **joints that don't change**, or **every part starting and stopping
together** **(ours)**.

- **Successive breaking of joints.** Motion unrolls as a wave through the chain: hips → chest → upper arm →
  forearm → hand → blade. Juniors start and stop every part at once, which is the classic stiff look
  (Babbitt via Williams; Cooper). For code, give each chain its own phase offset. A 2–4 frame stagger
  (33–67 ms at 60 fps) is a starting point, not a rule. Too much overlap looks weak and floppy.
  - In `swings.js` a clip's `lead: [hipsSec, chestSec]` (default `[0.033, 0.017]`) plays the hips' and
    chest's keys that much earlier than the hand's. **The whip** is the next link: through the first half of
    a cut the hand runs ahead and the blade hangs back (~30° short at mid-cut), then passes the hand as the
    cut ends.
- **Separation vs compensation** (Dyabin, Shadow Fight). The body's centre of mass moves smoothly even when
  the blade is sharp.
  - *Separation* (a strong slash): the legs and torso build the twist, then nearly stop as the energy
    passes into the blade.
  - *Compensation* (fast but light): the body turns against the strike.
  - A slash with neither reads weak.
- **Arcs.** Keep them, and break them on purpose. Broken arcs show in repeated game moves. Arcs that are
  too perfect read floaty, so let a heavy part such as the head arrive late (Cooper).
- **Secondary motion is springs, not keys.** The coat, the hair, the sleeve streamers and the drawn heading
  are already springs in `anim.js`. Make new followers springs too (section 7). Chain them so each link
  follows its parent's output, with softer links toward the tip. The lag builds down the chain on its own.

---

## 4. Posing

- **Line of action first.** One clear curve through the body, with the limbs hung on it.
- **Silhouette: the fill test.** Fill the pose solid. If the action can't be read, the pose fails: the arm or
  blade has sunk into the body's mass, the "blob". Check it at the game camera (Cooper; Riot).
- **Gaps from above (ours, from foreshortening and Riot's practice).** At ~58° down the upper body overlaps
  the lower, so every key pose needs a clear gap between the arms and the body *as seen from above*.
- **Balance.** The centre of mass sits over the supporting foot, or between the feet when still.
  Off-balance poses look wrong even when players can't say why. In `swings.js`: keep the hips low enough
  for the legs to reach planted feet (`HOLD_REACH`, the toe drag).
- **Contrapposto.** Hips turned against shoulders reads as weight.
- **No twinning.** Never mirror both arms or both legs, and stagger their timing. For the free hand:
  **(ours, the owner)** it must not flail, go rigid, or park on the hip. It answers the blade: gather and
  split, opposition, out of the blade's path, arms in through turns and out as the brake, the fingers
  leading the point (`swings.js` free-hand notes; `offHand.js`).
- **Character and weapon are one shape.** Plan the blade's path with the body's, not after it (Moss 2).
- **Exaggerate, consistently.** Push the pose at extension: a slightly longer reach, a deeper lunge. Keep
  the same level across the hero and every boss (Cooper; Slynyrd).

---

## 5. Attacks

### 5.1 Hero and boss have opposite budgets

- **The hero's anticipation is minimal**, because it costs input lag. Overlap it with the action. A long
  recovery feels "sticky". Even one frame of anticipation helps (Cooper; Cartwright; Slynyrd).
  - Responsiveness: 50–100 ms from press to motion feels tight, ~200 ms feels sluggish (Mick West via Zhang).
  - **Mark where the follow-through can cancel.** Let it play out, but let input interrupt from a set frame.
    God of War buffers the next attack through the hit and fires it at once after it; block cancels anywhere.
    Smash buffers the last ~10 frames. Keep the latest press. Accept slightly late input to cover display
    latency (Williams; Hagdahl).
- **The boss's anticipation is long, because it is the telegraph.** Bigger payoffs get longer windups.

### 5.2 A boss attack, phase by phase (Dark Souls 3 via Zhang; GD Keys)

1. **Opening pose.** Distinct for every move: each anticipation must look different from the boss's other
   moves.
2. **Signal (windup).** The weapon's arc is the cue.
3. **Attack.** The hit is live only 2–4 frames. Near-instant and steady in speed, so the player knows when
   it lands.
4. **End pose.** Held ≥ 170 ms so the player sees it is over (≥ 240 ms when it is bait).
5. **Return.** The punish window, and the longest phase.

**The numbers.**

- Signal plus attack ≥ 340 ms, shorter only as a deliberate spike (DS3).
- **Anticipation = reaction time (~250 ms) + the player's counter's startup + a buffer** (GD Keys).
- **Mixed tells cost more.** Simple visual reaction is 200–250 ms. A choice adds ~100–300 ms (≈1.5× for two
  options, 2× for three). Telling normal / blue / red / black apart is a choice, so a tell that could be any
  of them needs a longer readable windup (Claypool; Nottingham).
- For Honor's floor: ~300 ms of indicator on a 400 ms attack, ~200 ms to react. 233 ms was "hard to react
  to".
- **Our floor (ours, COMBAT.md):** windups ≥ 0.7 s in phase 1, hits of a string ≥ 0.45 s apart, the timing
  cue 0.35 s before impact. These rules win over any number above.

**Fairness.**

- **One cue, one meaning, always** (Game Developer ARPG readability).
- **The hitbox matches the visual**: a tell that looks more dodgeable than it is breaks trust (Riot).
- **A delayed attack is fair only if the delay is always the same** and the telegraph is clear (the Elden
  Ring meme).
- **Use several cues at once**: pose, sound, the fire field. Players learn rhythm by ear (DS3; Sekiro's
  ringing steel). Quiet other effects during a windup.

### 5.3 What makes a cut read as powerful (swordsmanship)

- **The body leads, the arm follows.** Hips and torso turn first, so the blade is up to speed before the
  arm commits. Keep the edge aligned along the cut's path (iaido / kenjutsu sources). In `swings.js`: the
  hips' turn is ahead of the chest's at mid-cut, the hand is furthest from the shoulder as the blade crosses
  his front, and the weight goes from the back foot (`bz` −, hips up) into the front (`bz` +, hips down).
- **The strike lands with the front footfall** (kendo's *ki-ken-tai-ichi*). The power starts from the rear
  foot pushing into the ground. Time the clip's `step` so the front foot lands at the active frames.
- **Don't lean in to cut.** Leaning forward cuts with the upper body only. A relaxed upper body is stronger
  than a tense one.
- **Follow through, then return to guard** (*zanshin*). The body carries on past the target.
- **Silver's "true times" (1599):** in fencing, the hand moves before the body and the body before the foot.
  That applies to a thrust or a guard change, where the point must move first. A power cut is driven from
  the hips (above) **(ours, reconciling the two)**.
- **Hong Kong action rhythm: pause / burst / pause** (Bordwell). Hold before the release and after the
  contact, so each blow registers. The combos' "quick cut into a finish that holds" is this rhythm.

### 5.4 Impact: hit-stop, shake, reactions

**Hit-stop is tiered by strength** (frames at 60 fps):

| hit | frames | seconds |
|---|---|---|
| light | 2–4 f | 0.03–0.07 s |
| medium | 5–8 f | 0.08–0.13 s |
| heavy | 8–12 f | 0.13–0.2 s |

- Street Fighter V uses 8 / 12 / 15 f. Over ~20 f it reads as a bug. Ours: the light clash 0.03 s, the
  plunge 0.13 s (`game.hitstop`).
- **Devil May Cry pauses on heavy blows only**, so light slices still feel like slicing. Itsuno: hold parts
  of a hard hit even inside a few frames.

**Sakurai's rules** (Smash):

- Both sides freeze, but the attacker still moves slightly.
- The victim shakes more: sideways on the ground, up and down in the air.
- The shake decays, and the hitbox does not move with it.
- Length scales with damage, up to a cap.

**Hit reactions** (Game Developer, "The role of animations in hit effects"):

- No cross-fade into a hit react, or it floats. Start from the hurt pose, fast then slow.
- Make reactions directional, matching the blow.
- An armoured foe still gets an additive flinch.

**Camera shake, the trauma model** (Eiserloh):

- Hits add trauma (0–1), and it decays linearly.
- The shake is trauma² (or ³), driven by Perlin noise, not random jitter.
- Scale it with the blow, and shake along the force (Nijman, "The Art of Screenshake").

**Effects stay at the blade (ours, the owner).** Sparks and marks go at the contact. The background never
changes colour. One idea at a time, shown big.

---

## 6. Reading at 34 px from a high camera

- **Pose for the one camera you have.** Cheat poses toward it (Riot's animators did for League).
- **Wide flat arcs survive; motion toward the lens dies (ours, from foreshortening).** At ~58° down, these
  survive: horizontal arcs across the ground plane, lunges, and leans that move the silhouette's outline.
  These vanish: a blade pointed at the lens, wrist roll, small elbow changes. So stage swings as
  **diagonals**, the blade crossing his front near chest height (`swings.js`: elevation within ~15° of level
  at mid-cut, no key above ~45°). A cut in an upright plane draws as one straight bar up the screen. The
  owner, session 25: "more diagonals".
- **Turn the blade's flat toward the camera.** It looks wrong in isolation but reads as a bigger shape in
  play (Avery Adams, God of War). In `swings.js` that is `flat` / `f`. The owner's hero picks keep a dark
  blade that lights on the cut **(ours)**.
- **Every letter counts.** At ~26×32 px one pixel of limb changes the read (Slynyrd 55). The hero is about
  9 letters wide, so one letter is ~11 % of him. Render at 720p, 1440p, 4K and phone: **the letter count
  is the look (ours)**.
- **Simplify for motion.** Detail that works in a still turns to noise in motion (Slynyrd; Dead Cells keeps
  models basic at ~50 px).
- **Value over colour.** The brightest letters go on the blade and the active limb; the cloak stays dark.
  Dota grades its heroes darkest at the feet and lightest at the head (Dota character art guide; Riot).
- **With few frames, effects carry the motion.** Dead Cells' effects carry much of the movement and impact.
  Riot treats clarity as one bucket that animation, VFX and sound share. Keep the slash trail on the strike
  only, gated by blade speed, with the impact at the contact point along the cut. Our curved arc trail is
  the owner's pick **(ours)**.
- **One smear frame is usually enough**, on the strike only, never on the anticipation or recovery
  (Slynyrd 9).
- **Expect thin parts to flicker.** Thin limbs and blades will pop letter to letter. Dead Cells lived with
  the pixel version of this. Check for it in the pop audit (section 8).

---

## 7. Code-driven technique

This game poses the hero and bosses in code: keys interpolated by Catmull-Rom, two-bone IK for limbs,
springs for followers. The closest published precedent is Rosen's Overgrowth (GDC 2014). It used very few
keys (secondhand: ~13 for the whole character) with spring and damper interpolation, and built
responsiveness into the physics first, with poses on top.

### 7.1 Springs that don't explode

- **Use exact springs, not naive ones** (Holden, "Spring-Roll-Call"). Explicit `lerp(x, g, k*dt)` blows up
  once k·dt > 1, and semi-implicit Euler blows up at large dt or high stiffness. Two forms that don't:
  ```js
  // damper, framerate-independent
  x = lerp(x, g, 1 - 2 ** (-dt / halflife));

  // critically damped spring, exact (d = 4·ln2 / halflife)
  const y = d / 2, j0 = x - g, j1 = v + j0 * y, e = Math.exp(-y * dt);
  x = e * (j0 + j1 * dt) + g;
  v = e * (v - j1 * y * dt);
  ```
- **Two chained springs** at half the halflife each give an S-shaped (eased) response.
- **Second-order dynamics** (t3ssel8r): a follower with frequency f (Hz), damping ζ and response r.
  - ζ < 1 overshoots and settles; ζ = 1 is critical.
  - r > 1 overshoots at the start; r < 0 winds up first, an anticipation.
  - Clamp k2 for stability: `k2s = max(k2, dt²/2 + dt·k1/2, dt·k1)`.
  - Defaults f 3, ζ 0.5, r 1.
- **Starting values** (the researcher's guide numbers; tune by film):

  | follower | settings |
  |---|---|
  | root, camera, IK targets | ζ 1, halflife 0.05–0.15 s |
  | cloak, hair | f 1.5–3 Hz, ζ 0.3–0.6 |
  | a free arm's or blade's follow-through | f 3–5 Hz, ζ 0.5–0.7, r 1–2 |

- **Avoid jitter.**
  - Clamp `dt`.
  - Spring in the parent's space, so the body's own motion is not fed in twice.
  - Ignore tiny targets: a lean under 0.5° is noise.
- **Never allocate per frame** (CLAUDE.md). Springs keep their state in preallocated arrays, as `anim.js`'s
  do.

### 7.2 Interpolating rotations

- **q and −q are the same rotation.** If their dot product is < 0, negate one before slerp or nlerp, or it
  goes the long way.
- nlerp is fine for small angles; it just isn't constant speed.
- **Blade directions as `[azimuth, elevation]`** (`a`, `ld`):
  - Unwrap the azimuth by the shortest delta.
  - Slerp directions near ±90° elevation.
  - Keep consecutive keys at most ~100° apart (`swings.js`).
  - `anim.js` already keeps a low blade out of the back-left (`DIR_AVOID`) and sends local moves the short
    way.

### 7.3 Blending between moves

- **Keep cross-fades short:** under 0.4 s (Epic), 0.1–0.25 s for combat. God of War blends into its shield
  stance over 3–5 frames.
- **Inertialization suits a code-posed character best** (Bollo; Holden). On a switch, store
  `offset = old − new` (position and velocity) and decay it with a critically damped spring. Only one pose
  is evaluated. `anim.js` starts every swing from "the pose he was in" (u = 0) for the same reason.
- **Never let a blend hide the anticipation** (Delannoy). Watch for speed jumps at blend points.
- **Additive life for idles and holds.** Breathing as a 0.2–0.3 Hz sine on chest and shoulders. Slow 1-D
  noise (0.1–0.5 Hz, a few degrees) on head and spine, on top of the pose (Perlin 1995).

### 7.4 Locomotion

- **Drive the step phase by distance, not time** (`phase += speed·dt / strideLen(speed)`), or the feet skate.
  Stride length and cadence both rise with speed.
  - Walk turns to run near Froude 0.5: about 2.1 m/s for 0.9 m legs.
  - Blend gaits on one shared phase so the change doesn't pop.
- **Lean into acceleration and turns.**
  - `lean = atan2(a, g)`, and `atan2(v·ω, g)` in a turn.
  - Scale it to 0.3–0.7 of that: the real angle looks too much.
  - Spread it down the spine, more on the lower joints, and smooth it over ~0.25 s (Little Polygon; the
    Vulkan tutorial).
- **Hips bob once per step and sway once per stride** (Little Polygon).
- **Plant feet in world space** and reach them with two-bone IK; release past an unlock radius. Cap root
  correction to a share of the speed, so it only corrects while moving (Holden).
- **Code drives locomotion and turning; committed lunges and hit reacts may move the root from the pose**
  (practitioner consensus; Hagdahl).

### 7.5 IK pitfalls

- **Elbow and knee flips.** A bend axis from `cross(hip→heel, hip→knee)` is unstable when the limb is nearly
  straight. Use a stable pole (`rp` / `lp` in `swings.js`, or the joint's forward axis), and keep a few
  degrees of bend.
- **Clamp the reach.** Keep it to `[ε, L1 + L2 − ε]`, and clamp every `acos` input to [−1, 1]. NaN freezes
  the frame (CLAUDE.md).
- **Hands on the weapon.** Solve the sword hand, then put the free hand on a socket on the grip (`two`,
  `offAt`). When it's out of reach, move the weapon or the chest, never stretch the arm.

---

## 8. How to judge a move

- **At the game camera first, at full speed, in a loop.** Loops expose broken arcs and pops (Cooper). Then
  check it from all four sides and close up. A pose that reads from one side only fails the free camera.
- **Measure (ours, hero-motion review):**
  - Arm snaps: the largest per-frame joint change.
  - Hand speed through the cut.
  - Cadence between hits.
  - A pop audit: any frame where a part jumps.
  - A transition audit against `main`.
- **Read the curves.** One clear ease out, one ease in, a small deliberate overshoot, a flat settle. Similar
  moves get similar curves.
- **Fill test every key pose** at the game camera.
- **Tools:**
  - `__tick(dt, frames)` steps the sim.
  - The Lab (`?lab` / F1): any boss beat, time scale, god mode, hitbox overlay, the `atk` slider.
  - Headless-Edge films of scripted takes for the owner.
- **Logic changes need `npm test` green.** The duel / lord / asc suites cover the duelist engine. New pose
  data can shift the seeded sims.

### The owner's checklist (ours)

- [ ] Every joint changes through the move; nothing starts and stops together.
- [ ] The free hand answers the blade: it doesn't flail, go rigid, or park on the hip.
- [ ] No twirls or flourishes the owner didn't ask for.
- [ ] Cuts are diagonals at the game camera, not upright bars.
- [ ] The pace sits between 0.25 s (too fast) and 0.42 s (too slow) per light hit, unless the owner moved it.
- [ ] The curved arc trail is kept; effects stay at the blade; the background never changes colour.
- [ ] Defensive play is never punished by the animation (a guard that drops, a dodge that can't be
      cancelled).
- [ ] A boss's tell reads at the game camera inside COMBAT.md's windows; one cue, one meaning.
- [ ] Shown on film at the game camera, one narrow change, 2–3 options for a taste call; the default is
      what the owner tried and approved.

---

## Sources

Animation fundamentals

- Jonathan Cooper, "The 12 principles of animation in video games" (Game Anim, ch. 3) —
  https://www.gamedeveloper.com/production/the-12-principles-of-animation-in-video-games
- Cooper, *Game Anim: Video Game Animation Explained*, 2nd ed. —
  https://www.routledge.com/Game-Anim-Video-Game-Animation-Explained/Cooper/p/book/9780367707651
- Notes on Cooper's five fundamentals (settles, overlap limits, cancel tails) —
  https://yufeizheng.myblog.arts.ac.uk/2021/10/24/thesis-research-week-3-the-five-fundamentals-of-game-animation/
- Mariel Cartwright, "Fluid and Powerful Animation within Frame Restrictions", GDC 2014 —
  https://gdcvault.com/play/1020575/Animation-Bootcamp-Fluid-and-Powerful; summary:
  https://80.lv/articles/tips-on-making-fluid-and-powerful-animations
- AnimSchool on breakdowns — https://blog.animschool.edu/?p=772
- Successive breaking of joints (Babbitt / Williams) —
  https://animationapprentice.blogspot.com/2019/04/what-is-successive-breaking-of-joints.html
- Twinning — https://www.animatorisland.com/defining-the-art-twinning/ and
  https://www.tutkit.com/en/text-tutorials/28479-avoid-twinning-bring-animations-to-life-with-offset
- Posing (line of action, balance) — https://courses.cs.washington.edu/courses/cse459/10wi/reading/posing.pdf
- Dyabin, separation and compensation in strikes —
  https://80.lv/articles/separation-compensation-principle-in-strikes-animation
- Animating a tiny character with a two-handed weapon (Moss 2) —
  https://80.lv/articles/breakdown-animating-tiny-character-with-massive-two-handed-weapon
- Delannoy, common mistakes in game animation —
  https://www.gamedeveloper.com/programming/common-mistakes-in-game-animation

Small size, high camera, readability

- Dead Cells, a 3D pipeline for 2D animation —
  https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-
- Slynyrd Pixelblog 56, top-down attacks — https://www.slynyrd.com/blog/2025/5/23/pixelblog-56-top-down-character-attack-animation
- Slynyrd Pixelblog 55, top-down animation — https://slynyrd.com/blog/2025/3/24/pixelblog-55-top-down-character-animation
- Slynyrd Pixelblog 9, melee attacks — https://www.slynyrd.com/blog/2018/9/8/pixelblog-9-melee-attacks
- Riot, animating Xayah — https://wiki.leagueoflegends.com/en-us/Xayah/Development
- Riot, Clarity in League — https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/
- Valve, Dota 2 character art guide — https://help.steampowered.com/faqs/view/0688-7692-4D5A-1935
- Readability in ARPGs — https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs
- Guilty Gear Xrd, GDC 2015 (keyframe-only limited 3D) — https://gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The
  and https://game.watch.impress.co.jp/docs/news/20150307_691725.html
- Avery Adams, weapon attack tips (blade flat to camera) —
  https://80.lv/articles/tips-on-weapon-attack-animation-from-god-of-war-animator
- Combat attack trails — https://edgelesscorner.blogspot.com/2019/04/vfx-of-combat-attack-trails.html

Combat feel

- Anatomy of an enemy attack in Dark Souls 3 —
  https://www.gamedeveloper.com/game-platforms/anatomy-of-an-enemy-attack-in-dark-souls-3
- GD Keys, anatomy of an attack — https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/
- Eric Williams, Combat Canceled (God of War) —
  https://www.gamedeveloper.com/game-platforms/combat-canceled-i-god-of-war-i-action-game-design
- Eric Williams, attack animations part 2 — https://pushing-buttons.blogspot.com/2009/02/attack-animations-part-2.html
- Ubisoft, For Honor attack timings —
  https://www.ubisoft.com/en-us/game/for-honor/news-updates/9OPowoU28h2YRO8zSvw5z/testing-grounds-how-attacks-are-changing
- Claypool, reaction time — https://web.cs.wpi.edu/~claypool/papers/reaction-time/paper.pdf
- Hit feel (SFV hit-stop, DMC, GoW, Bayonetta) — https://threadreaderapp.com/thread/1385104062157254660.html
- Critpoints on hit-stop — https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/
- Sakurai on hit-stop — https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/ and
  https://nintendowire.com/news/2022/12/12/this-week-in-sakurai-12-5-12-11-fine-tuning-hit-stop-and-cheating-the-system/
- SSBWiki, hitlag and buffer — https://www.ssbwiki.com/Hitlag, https://www.ssbwiki.com/Buffer
- The role of animations in hit effects — https://gamedeveloper.com/programming/the-role-of-animations-in-hit-effects
- Squirrel Eiserloh, Juicing Your Cameras With Math, GDC 2016 —
  https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing
- Jan Willem Nijman, The Art of Screenshake —
  https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games
- Simon Hagdahl, tactile response — https://sites.google.com/view/realtime-animation-tips/tutorials/animation-tactile-response
- Itsuno on DMC5 — https://kotaku.com/devil-may-cry-5s-director-tells-us-how-they-made-combat-1833642299
- Creating fluid combat animations for God of War —
  https://gamedeveloper.com/production/creating-fluid-combat-animations-for-the-new-i-god-of-war-i-
- The art of the fakeout (fair delayed attacks) — https://www.wayline.io/blog/the-art-of-the-fakeout-combat-design
- David Bordwell, a glance at blows (pause / burst / pause) — https://www.davidbordwell.net/blog/?p=3208

Swordsmanship

- George Silver, Paradoxes of Defence (true times) — https://www.aemma.org/onlineResources/silver/silver2_body.htm
- Ki-ken-tai-ichi — https://www.kendo-guide.com/terminology_ki_ken_tai_icchi.html and
  https://www.kendo-guide.com/ki-ken-tai.html
- The men cut (ground force, footfall, follow-through) — https://ejmas.com/tin/2007tin/tinart_riddle_0712.html
- Body-led cutting, edge alignment — https://ittendojo.org/dbfiles/download/swordandspirit/pdf/32

Code-driven animation

- David Rosen, An Indie Approach to Procedural Animation, GDC 2014 —
  https://www.gdcvault.com/play/1020583/Animation-Bootcamp-An-Indie-Approach and
  https://www.youtube.com/watch?v=LNidsMesxSE
- Daniel Holden, Spring-Roll-Call — https://theorangeduck.com/page/spring-roll-call
- Holden, code vs data driven displacement — https://www.theorangeduck.com/page/code-vs-data-driven-displacement
- Holden, fitting code driven displacement — https://theorangeduck.com/page/fitting-code-driven-displacement
- Holden, simple two-joint IK — https://theorangeduck.com/page/simple-two-joint
- t3ssel8r, second-order dynamics — https://www.youtube.com/watch?v=KPoeNZZ6H4s; reimplementation:
  https://gist.github.com/Andicraft/ab605dda924a0321e755abf8f573ebd7
- Little Polygon, locomotion part 1 — https://blog.littlepolygon.com/posts/loco1/
- Vulkan tutorial, physics-driven lean —
  https://docs.vulkan.org/tutorial/latest/Advanced_glTF/Procedural_Animation_IK/06_physics_driven_lean.html
- Walk-run transition — https://en.wikipedia.org/wiki/Transition_from_walking_to_running
- Ubisoft IK Rig — https://80.lv/articles/how-ubisoft-revolutionises-animation-in-games
- David Bollo, Inertialization, GDC 2018 —
  https://gdcvault.com/play/1025165/Inertialization-High-Performance-Animation-Transitions
- Epic, transition rules — https://dev.epicgames.com/documentation/en-us/unreal-engine/transition-rules-in-unreal-engine
- Centripetal Catmull-Rom (Yuksel et al.) — https://people.engr.tamu.edu/schaefer/research/cr_cad.pdf
- Slerp — https://en.wikipedia.org/wiki/Slerp
- Ken Perlin, Real Time Responsive Animation with Personality (1995) — https://mrl.cs.nyu.edu/projects/improv/

Some talks (GDC Vault) are members-only, and their points here come from published write-ups. Rosen's
13-key figure is secondhand. Sekiro's deflect windows are community figures that conflict, so none are
used here.
