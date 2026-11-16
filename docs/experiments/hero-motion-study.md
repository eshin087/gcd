# The Wanderer: Tempered (unapproved visual study)

**Status:** draft experiment, awaiting owner review. Do not merge or adopt without the owner's
choice. The motion studio and the playable preview are separate pages; the regular game is unchanged.

Open `/hero-study.html` on this PR's Vercel preview, or run `npm run dev` and open
`http://localhost:5173/hero-study.html`. For actual play, open
`/hero-play.html?level=ash&hero=tempered` (or `hero=current`). The normal `/` URL is the existing game.

## Play it in the game

The owner requested an in-game preview after the side-by-side film. `/hero-play.html` boots the
actual game and decorates only that page's player instance. Choose **Explore / reset** or **Fight
boss**, then switch **A · Current / B · Tempered** during the same fight. The level selector offers
Cinderwood, Ashfall and the Obsidian Throne. **Closer camera** helps inspect the character at the
normal gameplay angle. **Invulnerable** starts on and can be switched off. On narrow screens, tap
the collapsed preview panel to open the controls; the normal touch / controller inputs still work.

The playable page replaces its own localStorage and sessionStorage with empty memory stores
**before** importing the game. It does not read or write the browser's existing stores. Reloading
discards settings and telemetry from the preview. It includes no analytics script.

The adapter reuses the studio's exact pose functions. Its draw transform is removed during IK and
inverted by `unlean` before SwordSweep uses blade points; `leanPoint` applies the matching forward
transform. Switching resets sweep history so the different silhouettes cannot produce a phantom
hit between them. It preserves player position, health, action clocks and boss state. Equipment
rebuilds get their own candidate pose map. Shared prototypes, bosses and combat tuning are unchanged.

This is a playable experiment, not final gameplay approval: the pose edits change the blade path.
Complete reach / outfit / alternate-move calibration and human feel review remain for adoption.

## Direction

Keep the Wanderer's identity and Claude's ink-line ASCII renderer, equipment, rig, IK, planted-foot
planner and spring-driven cloth. Make the silhouette more compact, the ready pose more deliberate,
and the cut feel carried by the hips and chest. The owner can reject the whole study without changing
the game. Claude's independent three-style draft [PR #56](https://github.com/eshin087/gcdAbyss/pull/56)
is untouched; this is an additional option, based on main `46e2c989` (PR #57).

| Element | Current reference | Tempered candidate |
| --- | --- | --- |
| Presentation proportions | 1:1 | width 1.08, height 0.94, depth 1.04 |
| Rest / readiness | approved at-ease / fencer poses | 3.5 cm lower centre, 3.5 cm wider foot target on each side |
| Ready blade | near-horizontal point | oblique line, roughly 28° to the sword side / 29° up before wrist constraints |
| Free hand in guard | on belt | open sword fingers beside the chest |
| Walk / run | existing speed-matched stride | same feet, lower centre, quieter vertical bounce and counterbalanced shoulders |
| Cuts | existing keyframed clips | per-cut hip, chest and compression accents; recovery releases more slowly |
| Roll, charge, hair, cloth | existing animation / springs | retained, with the candidate's presentation proportions |

The scale is a **drawing transform**, removed while IK and cloth solve. It compresses the entire
rendered actor, including its weapon. It is not a new anatomically re-authored skeleton. All data in
`heroDims.js`, `swings.js`, `combat.js`, and every existing game source file is unchanged.

## Review

- A + B uses the same camera, lighting, renderer, phase and root path. Neither actor is normalized
  to the other's height. A / B solo buttons switch without resetting time and are useful on phones.
  Narrow phones open on the candidate alone; A + B remains one tap away.
- Full sequence: rest → guard → walk → run → sprint → combo → block → charge → cleave → dodge.
- Nine motion selections, five camera angles including the actual 58° / 36 m game scale,
  turntable, 0.25× / 0.5× / 1×, pause, one-frame advance, and deterministic timeline scrubbing.
- Both actors get the same original combat timing and default variant. This pilot is a controlled
  audition: it does not reproduce input buffering, cancel windows, targets, impacts or real combat.
- Reduced-motion preference starts paused. Nothing is saved, and no game flow, audio engine,
  analytics, localStorage, network data or player settings are instantiated by the study.

![Current and Tempered, ready guard](hero-motion-study-v01.png)

## Isolation and verification

Only `hero-study.html` and `hero-play.html` import `src/dev/heroStudy/`. `scripts/build.mjs` emits separate
bundled pages. It adds no import or branch to the normal game. The build of `dist/index.html` using the
original build script from `46e2c989` and the experimental build script matched byte-for-byte:
SHA-256 `77146f1462407f64105582ca05e9eb0674b603cd3e8553f0f1c91eeb3355c342`.

`npm run test:hero-study`: 4,361 paired frames across nine sequences check finite poses and rig
matrices, the blade's floor clearance, synchronized root travel, repeatable seeking, private
materials / pose maps, unchanged shared definitions, and removal of presentation scale for IK.
This check is also appended to `npm test`. The playable adapter additionally checks real blade
points at 36 headings / leans, inverse / forward transforms, exact pose-map restoration, equipment
rebuilds, sweep reset and storage isolation (including failure before game boot if isolation fails).

The existing full integration suite (`npm test`), glyph and changelog checks, and `npm run build`
pass locally. The new study check was rerun after the final recovery refinement.

Browser checks use real headless Edge / WebGL: front, side, back, three-quarter and game angles;
13 sampled pose captures; playback, slow motion, pause, single-frame advance and scrub controls;
390×844 portrait and 852×393 landscape layouts. No browser errors on the study. Desktop and phone
screenshots are review evidence, not owner approval. A physical phone and human combat feel have
not been validated. Playable browser checks cover both variants' idle, run, attack and dodge in all
three levels, live A/B health / position preservation, level navigation, camera and invulnerability
controls, 390×844 layout, and native-storage sentinel preservation. A separate normal animation-loop
check uses actual keyboard / mouse input: both variants land five guarded cuts on the Ash Disciple.
No browser errors. The normal-game HTML hash still matches the base above.

## Handoff for Claude after the owner's choice

The changes are self-contained in `src/dev/heroStudy/` and the two HTML preview entries. `actor.js`
owns the shared candidate poses; `gameplayActor.js` adapts the real player on the playable page.
No shared pose API or boss skeleton changed.

If selected, first decide whether to keep a presentation transform or author actual per-hero
dimensions. Then integrate **only the hero**, re-fit outfit variants and weapons, recheck transitions
from all combat states / variants, and run the blade reach, contact, grip, planted-foot and coat
clearance tests in all three levels. Recovery timing in this study preserves the windup / active
boundaries; changed transforms still need gameplay hit-sweep validation before adoption.

If rejected, close this draft PR. Nothing was merged, no production deployment was requested, and
Claude's current checkout / PR remains usable. The worktree is disposable after review.
