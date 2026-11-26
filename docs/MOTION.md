# MOTION: learning animation and effects from the owner's reference footage

Read this before you animate a character or build an effect. The owner found that real game footage
(YouTube) makes our animation far better than invention does: hand-invented arm choreography failed four
rounds; the same moves reproduced from footage were accepted. This file is the method, the owner's standing
taste, the index of timing cards, and how bodies and effects use footage. Tools: `tools/refstudy/README.md`.

Rules of the road: never name the source game in code, comments, tests, docs or commits ("the owner's
reference footage"); never commit reference frames; the owner supplies the footage (a YouTube id and the
time span); if you have none, ask for it, do not substitute taste.

## 1. The method (do these in order)
1. **Reference first.** Grab the span coarse (0.25 s), find the beat, then fine (1/30 to 1/60 s, cropped to
   the action). `tools/refstudy`: `grab.mjs`, `sheet.py`. Look at the sheets before writing any code.
2. **Measure, do not feel.** Times from f0 (contact / first motion), sizes in body widths, counts of sparks,
   colours, what moves and what stays still (camera, background, the defender). Judge from frames, never
   from a still: timings only show on a strip.
3. **Write a timing card** in `docs/motion/<name>.md` (format in `docs/motion/README.md`) and add it to the
   index below. The next agent starts from the card, not from the video.
4. **Translate to our look**: smaller, calmer, finer. Bursts are fire-field heat plus tiny glyph particles
   (`docs/STYLE.md`), never big glowing sprites. Our camera is 36 m / 58 degrees above, so the hero is ~34 px
   tall at 720p: what is big in the footage is a few letters here.
5. **Prototype ONE narrow thing** (one effect, one move), not four directions.
6. **Film it at the game camera** with the rig (`run.mjs`, `review.sh`): from all four sides of the hero for
   poses, and a 60 fps strip beside the reference crop at the same times. Measure (elbow flips, hand speeds,
   a pop audit: `node tests/integration/integ.mjs . armaudit`) before sending.
7. **Let the owner pick**: 2-3 variants behind URL switches (`?x=a|b|c`) or a Lab button, labelled sheets,
   one question. Ship as the DEFAULT the variant they actually tried and approved (not your recommendation).

## 2. The owner's standing taste (read these as rules)
1. **Effects live at the thing, not the screen.** Never change the background's colour or print for a combat
   moment: no dimming, grade, vignette, iris or ring through the floor. A parry's effect is detailed, natural
   ASCII sparks at the blades; a dodge's is the afterimage itself (more detail, not more screen).
2. **Subtle and fine.** "Cool, subtle, detailed" = thin and fine, many tiny letters; not a band, not a big
   glyph. A tick on a text option is not a pick: they rejected four ticked directions on film.
3. **No cut, no teleport, no zoom** in a chain; a small camera shake per contact. The defender stays planted,
   the attacker's posture breaks and he reels. Each contact is its own burst; a chain builds up.
4. **Follow the reference, not invented choreography.** Reproduce poses pair by pair against reference frames
   from the same views. A follow-through must visibly move for ~10 frames; nothing between hits; no flourish
   or twirl ("fierce skilled striker"); no cut keys solved for a straight tip path.
5. **Anatomy is judged.** Natural joint angles, no stiff or flailing free hand, no sword through the face;
   keep a visible gap (>= 8-10 cm) between a held blade and the hood, cloak included. Look at BOTH hands and
   whatever sits next to the part you changed.
6. **Judge at the game camera, all four sides.** A blade leaning at the camera is drawn straight down across
   the body or into the ground; effects at the end of gameplay reach land on the grass from the front view.
7. **Pace is the owner's number.** Light chain: 0.25 s a hit was too fast to follow, 0.42 s too slow; ~0.32 s
   with a 0.12 s cut is the working value. For speed calls point them at the Lab's `atk` slider.
8. **Look changes must show at a glance.** A recolour is "just a reshade". Show option sheets zoomed (x4
   crops at the game camera, the hero beside the boss). Bosses, props, animals print like the hero: bodies of
   lit letters, a pale ragged hem (ADR-193).
9. **Prototype before polish.** Cheap switchable prototypes first; tests and docs after the pick.
10. **Default = what the owner approved.** Set the shipped default to the variant they tried in game; repeat the
    defaults in the merge message.
11. **Hand-over looks like a clip.** Films (60 fps MP4 with a 3x inset and a slow copy) and sheets, as full
    https links; they judge on films, and each round costs hours.

## 3. Timing cards (index)
| Card | What |
|---|---|
| [docs/motion/deflect.md](motion/deflect.md) | the perfect deflect: bloom, sparks, chain rhythm |

## 4. Effects from footage
Effects (sparks, blooms, trails, afterimages) go through timing cards: measure the footage, write the card,
build the effect from the fire field and glyph particles, film at the game camera beside the reference crop.
A card's numbers are targets in seconds and body widths, not literal sizes.

## 5. Bodies from footage: pose tracking (owned by the "0 - Game Engine" session)
Bodies (the hero's moves, boss melee) are not hand-timed: `scripts/mocap/` (on that session's `hero2/*`
branches, and `scripts/mocap/duelist` for boss melee, PR 147) runs MediaPipe's pose landmarker (heavy) per
frame on the footage, fuses the takes of a move, retargets onto our skeleton by bone direction, cleans it
(smoothing, foot contact) and exports clip-set modules (`hero2/clips/`, format in `hero2/README.md`). Clip data
is committed; frames never are. Do not rebuild pose tracking: use theirs. How the two fit:
- **bodies -> mocap clips**; **effects -> timing cards**. The clip supplies when contact happens; the card says
  what the effect does at that moment (the parry bloom on the clip's contact frame).
- Both start with `tools/refstudy` (grab and sheet the span); mocap reads the frame folder.
- Both end the same way: film at the game camera (`run.mjs`, `review.sh`), measure, owner picks.
Until the branches merge, check `git branch -a | grep hero2` and the open PRs before building anything that
touches a skeleton.

## 6. Adding to this file
Every study ends with a card and, when the owner states a new taste, a line in section 2. Keep it factual,
dated, and free of the source's name.
