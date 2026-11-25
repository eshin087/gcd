# gcdAbyss — instructions for Claude agents

ABYSS is a long-term browser game: a **wuxia skill boss rush** in the vein of Phantom Blade Zero,
with some exploring and RPG elements and fixed rewards (techniques, weapons, abilities; ADR-059),
rendered in its own ASCII look. Today: eight levels, each its own
page load (`?level=`): Cinderwood Hollow (the Cinder Wyrm), the Ashfall Courtyard (the Ash Disciple,
a three-phase human duelist), the Obsidian Throne (the Starless Lord, a four-form duelist with Void spells)
the Skybreak Ring (Tian Lei, the Last Ascendant: a bare-handed three-form duelist with ki blasts and beams)
the Foxfire Terrace (Wen Yao, the Thousand-Body Fox: a bare-handed fighter who fights beside paper copies of himself)
the Windless Grove (Lu Wusheng, the Sheathed: one draw to parry or roll; his reward, One Breath, is the
hero's first learned technique, `game/unlocks.js`), the Hall of Falling Script (Xin Yi, the One Who Woke:
two bars, one hand, then two guns, then the Source, in a hall whose three scenes morph; his reward, the Long
Second, is the second learned technique) and Halcyon Plaza (Halcyon, the Last Saviour: a flier who
fights in sword reach, his eyes, a city his moves tear down; no reward yet).
Read this file first, every session.

- Repo: https://github.com/eshin087/gcdAbyss · Live: https://gcdabyss.vercel.app (auto-deploys `main`)
- Stack: Three.js 0.180 (WebGL2), plain ES modules, no framework, esbuild only for the release bundle.

## Start-of-session checklist
1. Read `docs/DEVLOG.md` (latest entries first) and `CHANGELOG.md` → `[Unreleased]` to see where work stands.
2. Read the docs relevant to your task:
   - `docs/ARCHITECTURE.md` — module contracts, `game` context, event catalogue, frame order. **Source of truth for cross-module APIs.**
   - `docs/STYLE.md` — the ASCII art direction. Its first section, "The house style", is the rule every
     new object and character follows (the dragon look).
   - `docs/COMBAT.md` — combat rules: attack tells, block / parry / perfect dodge, balance numbers.
   - `docs/ROADMAP.md` — where the project is going; pick work from here when unsure.
   - `docs/DECISIONS.md` — architecture decision records (why things are the way they are).
3. `npm install` if `node_modules/` is missing.

## Commands
```bash
npm run dev      # http://localhost:5173 (zero-dependency static server, no build step)
npm test         # headless integration sims (real game modules, mocked DOM/WebGL) + glyph check,
                 # side by side (tests/run.mjs; --serial or --jobs N after `npm test --`;
                 #  --shard I/N one of CI's parallel shares, --list shows the shares; ADR-153)
                 # (one suite: node tests/integration/lord.mjs . <scenario>, also integ.mjs / duel.mjs / world.mjs / asc.mjs / fox.mjs / city.mjs;
                 #  `duel.mjs . pace` / `lord.mjs . pace`: the duelists' pressure meter, ABYSS_PSEEDS / ABYSS_PSECS;
                 #  woke.mjs: Xin Yi, `woke.mjs . strategy` opt-in)
npm run build    # single-file dist/index.html (what Vercel serves)
npm run hero-parts  # regenerate src/entities/player/heroParts.js (needs Blender 4.2+; ADR-037)
```
Levels: `?level=ash` loads the Ashfall Courtyard, `?level=starless` the Obsidian Throne, `?level=ring` the Skybreak Ring, `?level=fox` the Foxfire Terrace, `?level=grove` the Windless Grove (`?tech=draw`: One Breath without the kill), `?level=code` the Hall of Falling Script (`?tech=lean`: the Long Second without the kill), `?level=city` Halcyon Plaza (default:
Cinderwood); the title screen and the Lab pick one too. Kept for later use (ADR-089; today's look is the default): `?heroLook=robe|swallow|warden`
(`-shade`: the face in shadow) and `?sword=sheet|ribbon|crescent` dress the hero (Lab: OUTFIT, sword);
`?wyrmTop=0|a|b` the drake head from above before the owner's pick `c` (ADR-189); `?wyrmFace=old` gives the wyrm the face it had before the drake (ADR-124), `skull|loong|demon` (ADR-120)
and `tyrant|viper|revenant` (ADR-124) the heads the owner passed on. The owner's picks with the options turned down behind them: `?wyrmLook=0|a|b` (c: the
wyrm's lean build; 0 = the wyrm before; ADR-123), `?zoomArt=a|c` (b: the letters
follow the zoom) and `?ablaze=off|a|c` (b: the wyrm's phase 3 fire). The impact pass's pieces (ADR-149): `?impact=off|all|stamp,ripple,react,thump` (default all; Lab: the 'impact' row), and
`?calm=0..3` the light at the contact (default 1; 0 = as before; Lab: the row's `calm` button). The streak pass's switches (ADR-167): `?streakfx=off|all|storm,tiers,aura,counter,sound,world`,
`?perfect=today|sharp|cinema` (default sharp), `?burst=0..3` (default 2), `?streakCount=` and `?auraFire=` (Lab: the 'streak' row); the perfect parry's spark spit `?parryFx=0|a` (default a; ADR-181; Lab: the streak row's `parryFx`); the sword's green flame (tiny marks burning round the steel, in the hero's own letters; ADR-182) is ON by default, `?mystic=0` turns it off (Lab: PLAYER → `mystic`). Bites (a blow knocks the bricks, the letters, out of
a piece where it struck; the hero's blade goes clean through what it does not fell, chipping it along
the cut) are on: `?chip=0` turns them off (ADR-132); `?cutStop=1` gives back the blade that stops there
(ADR-177; Lab: WORLD → Blade). Floor marks (every boss blow that meets the ground leaves a mark of its
kind until the reset; ADR-177): `?marks=0` leaves today's cracks only. Grass the sword cuts (the hero's
blade mows what it passes low through, every floor mark tears the grass out in its shape; ADR-180):
`?mow=0` leaves the grass as before. The grove's bamboo: `?bamboo=0|b` (a, the owner's pick: five kinds of cane mixed in clumps;
0 = the grove before; ADR-151). The living world (ADR-163): `?life=off|all|<pieces>` (a comma list of
`wind, litter, steps, weather, creatures, air, arrival, answer`) and `?lifeK=0.25..2` its strength; ON by
default (the owner's pick; `?life=off` turns it all off; Lab: WORLD → the 'life' rows and the layers' buttons).
The attack sounds (cues only on blue / red blows, recorded where loaded; every boss's blade or fist
through the air): `?sfx=old` plays the sounds before (a tick on every tell, all synth; Lab: the 'sfx' row).
The duelists' look switches (`?kindle=`, `?qi=`, `?ashLook=`, `?lordLook=`, `?floor=` ...; ADR-122): no
parameter draws the owner's picks, `?looks=old` the looks before that pass, one switch its option
(Lab: LOOKS); the table is STYLE.md → "The look switches". In the dev server: append `?lab` to the URL (or press **F1**) for the **Lab** — trigger any boss
ability / phase / transition, god mode, time scale, hitbox overlay. Console: `__game` (everything),
`__tick(dt, frames)` (step the sim even when the tab is hidden), `__inspect(x, y, w, h)` (magnify).
In Claude Code the preview config is `.claude/launch.json` (`abyss-dev`).

## Rules
- **Contracts first.** Cross-module APIs and event names live in `docs/ARCHITECTURE.md`. If you
  change one, update that doc in the same commit and grep every producer/consumer.
- **Content is data.** Attack definitions (timings, damage, tell type), tuning numbers and enemy
  stats live in `tuning.js` / data files, not buried in logic. New enemies reuse the shared combat
  system (`src/combat/`) and the actor contract.
- **One art design: the dragon look.** The owner's reference for how this game is drawn is the
  Cinder Wyrm as it ships ("the perfect ascii look im aiming for"; ADR-093, ADR-100). Read
  `docs/STYLE.md` → "The house style" before making anything visible. In short: small fine digits, a
  dark body with brighter digits only where light catches, an outline made of stroke characters, no
  blank cell inside a shape.
  - Every NEW background object (stone, metal, bone, a building, a statue, a prop) is drawn through
    the prop art path: `createPropArtMaterial`, or `FLAG.ART_PROP` on a screen-grid prop.
  - Every NEW creature or character is drawn through the wyrm's art path (`FLAG.ART`).
  - Every NEW effect that burns, glows or strikes as a body (fire, a spell, a bolt, a blade's trail,
    a timing cue) is heat in the fire field (`game.fx.fire`, STYLE.md "The fire field"): it prints
    in the same small letters. Glyph particles are for small things that fly on their own (embers,
    sparks, dust, debris), about one letter cell in size. No big glowing glyph sprites.
  - Do not invent another glyph style, letter size, ramp or font for something new.
  - Do not restyle what exists and is not in that look (the hero, the human bosses, the floors, the
    grass, the trees) unless the owner asks: each was their call.
  - Any change to how something looks: render before / after options and let the owner pick first.
- **ASCII look is a feature.** Anything visible must go through the glyph systems described in
  `docs/STYLE.md` (the art pass, screen-grid ASCII, carved floors, the fire field, glyph particles). No plain shaded
  meshes. Only glyphs in the world atlas may be passed to `gi()` / materials / particles — `npm test` checks.
- **The world breaks, letter by letter (ADR-107, ADR-132, ADR-177).** Every background object in every
  level is destructible, and a hit knocks its letters off exactly where it lands ("bites"); the hero's
  blade goes CLEAN THROUGH what it does not fell (its swing runs as in open air; the piece is chipped
  along the cut; `?cutStop=1` keeps the old stop). Follow the checklist in `docs/ARCHITECTURE.md` →
  "Destruction" → "Making a new object destructible". In short:
  - Anything new that stands in a level and could be hit is listed in its set's `breakables` (not
    merged into the static meshes), with a finite `hp`, a `mat` and a footprint `r` that matches what
    is drawn (the circle the blade crosses and chips).
  - Build it from non-indexed triangle geometry through one of the two drawing paths (`look: 'range'`
    in a set's merged mesh, or `'prop'` / `'grid'` through the breakables' rigid batch). Bites are made
    from its triangles; do not pre-split it into cubes, and do not hand-shrink its triangles (the
    level is cut to brick size at build time).
  - Anything new that hits (a blow, a projectile, fire) calls the world: `world.impact`,
    `world.ignite`, `world.destructibles.strike / sweep / stop`, guarded with `?.`. Pass the blow's
    real height (`y`, or a blade's `ya` / `yb`) so the bite lands where it struck. Its power goes in the
    fighter's tuning.
  - Anything new that hits the FLOOR calls `world.groundBlow(x, z, { kind, power, ... })` (a duelist's
    beat may give its own `groundMark` instead), so the floor keeps a mark of its kind; it damages
    nothing (ARCHITECTURE.md "Floor marks").
  - Anything new that drifts or lives in the air (dust, smoke, a flock, an animal) prints through
    `LetterBatch` (`world/life/letterBatch.js`) in the tiny-letter look: many tiny faint letters in a
    clump, never bigger or brighter ones (STYLE.md "The living world").
  - A new level is covered by the world test `bite` with no change (it walks the level registry): it
    fails if a level lists no breakables, or a piece gets no bricks. Only an object the owner decided
    stays whole is left out of `breakables`, and the decision is written down (today: the bonfires,
    the sect gate, the bell (it only rings), the throne and its dais, the fallen star, the seal, and
    the whole training room).
  See also `docs/COMBAT.md` → "The world breaks".
- **The world is alive, by one wind (ADR-163).** Anything new that drifts, falls, hangs, smokes or
  sounds like air reads `game.world?.life?.wind` (`at(x, z, out)`, `dirX / dirZ / speed / level`; the
  shaders `uWind` / `uWindFronts` through `WIND_GLSL`; cloth through `hangFrom`) instead of inventing its
  own drift. A new layer follows THE CONTRACT in `src/world/life/life.js` (`docs/ARCHITECTURE.md` →
  "The living world"): GPU objects only through `life.build`, on its first update with the piece on;
  never `Math.random` (`life.rand`); nothing on screen and no uniform written with its piece off; no new
  event. A new one-shot sound of the world goes through `lifeSay` / `life.sound` and a recipe in
  `LIFE_SFX` (`audio/lifeSfx.js`, its numbers in `lifeSfxTuning.js`; ADR-180), never Math.random. A new level gets a block in each `<layer>Tuning.js`; without one it gets a quiet default:
  a 0.8 m/s breeze with no fronts, no weather, litter or creatures, the steps' fallback ground, the
  answer's and the air's defaults, and an arrival shot that looks at the origin (give it a block). The
  `life` suite walks the level registry.
- **Combat must be readable.** Every enemy attack declares a tell type (`normal` / `blue` parry /
  `red` perfect-dodge) and a windup long enough to react to. See `docs/COMBAT.md`.
- **Never freeze the frame.** Per-frame code must not throw; `main.js` isolates module errors, but
  guard optional references and avoid NaN. No heavy per-frame allocations.
- **Verify visually.** Rendering/feel changes need a browser check (dev server + screenshots, the
  Lab, `__tick`). Logic changes need `npm test` green. Add/extend tests in `tests/` for new systems.
- **Keep history.** Every working session ends by:
  1. adding a dated entry to `docs/DEVLOG.md` (what changed, why, what's next, open issues),
  2. updating `CHANGELOG.md` `[Unreleased]` (Added / Changed / Fixed / Removed), and giving each new
     headline a short player-facing entry in the game's WHAT'S NEW list (`src/ui/changelog.js`,
     same title; `npm test` checks),
  3. recording any significant design choice as a new ADR in `docs/DECISIONS.md`,
  4. updating `docs/ROADMAP.md` checkboxes.
- **Commits**: small, imperative subject (`combat: add parry window`), body explains why. Area
  prefixes: `render`, `world`, `player`, `dragon`, `enemies`, `level`, `combat`, `ui`, `flow`, `audio`,
  `lab`, `docs`, `build`, `test`.
- **Every change goes through a PR — `main` is protected** (no direct pushes, even for admins;
  required check `test-and-build` = `npm test` (four parallel `tests I/4` jobs) + `npm run build` on
  an up-to-date branch, passed at once for a docs-only PR (docs/, *.md, .claude/; ADR-153); linear
  history, squash/rebase merge, branches auto-delete). Flow: branch → push → `gh pr create` → CI +
  Vercel preview deployment on the PR → squash-merge → Vercel deploys `main` to production
  (gcdabyss.vercel.app). Never bypass the protection. The squash commit takes the PR's title and
  description, so write them as the commit message. Every PR auto-merges: `.github/workflows/automerge.yml` sets squash
  auto-merge when a PR is opened (the owner's call, ADR-185), so it merges as soon as `test-and-build` is
  green on an up-to-date branch. To hold one back for the owner to look first, open it as a draft or with
  `gh pr create --label hold`. When `main` moves, bring the PR up to date with `gh pr update-branch <n>`.
- **Deployment hygiene (Vercel storage):** the project keeps deployments 30 days (preview,
  production, canceled, errored). `vercel.json` `ignoreCommand` skips deployments for commits that
  only touch docs / *.md / tests / .github / .claude — keep doc-only work in its own commits.
  It only diffs the pushed tip against its parent (HEAD^..HEAD), so on a PR branch make the LAST
  pushed commit a code commit when you need a fresh preview. Don't create manual CLI deployments (`vercel deploy`); let the Git integration deploy.
- **Releases**: bump `version` in `package.json` and `GAME_VERSION` in `src/ui/changelog.js`, move
  `[Unreleased]` to a version heading in the changelog (and the LATEST release in `changelog.js` to
  that version), tag `vX.Y.Z`.

## Layout
```
src/core       config, input, camera rig, math, rng, events
src/render     glyph atlases, shared shader lib, materials, particles, lights, frame pipeline
src/world      ground, grass, forest/stones/bones/bonfire, landmarks (the big set pieces), scorch map,
               atmosphere, colliders, destruction (destructibles, fire, scars, breakTuning),
               life/ (the living world: life.js + a layer and its tuning each) and hang.js; with
               audio/air.js (the air's sound) and game/arrival.js (the arrival shot)
src/combat     shared combat rules: hit resolution, guard/parry/dodge, attack tells
src/entities   player/ (gear/ = equipment slot items)  dragon/  enemies/duelist/ (the engine human
               bosses share)  enemies/ashDisciple/  enemies/starlessLord/  enemies/ascendant/  enemies/thousandFox/
               enemies/sheathed/  enemies/wokenOne/  enemies/halcyon/  (future: npcs/)
src/levels     level registry (?level=): the set, the boss, the flow's lines per level
src/ui         HUD, menus, WHAT'S NEW (changelog.js)   src/game   flow (title, boss intro, death, victory)
src/audio      procedural WebAudio  src/dev    Lab / debug tools
tests/         headless integration sims + static checks
docs/          ARCHITECTURE, STYLE, COMBAT, ROADMAP, DECISIONS, DEVLOG
```
