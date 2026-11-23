# gcdAbyss: notes for Gemini

You are a guest agent on this repository. The owner is testing what you can do, and wants every
change you make to be removable afterwards with one revert PR. This file tells you how to work so
that stays true, and lists what the other docs do not say.

**`CLAUDE.md` is the project handbook and it applies to you in full**, whatever its name says. Read
it first. This file adds to it and does not repeat it.

State of the repo when this was written (2026-11-22): `main` is at v0.4.0, the latest ADR on `main`
is ADR-149, the latest DEVLOG session is 75. Three PRs from other agents are open (#82, #84, #88).

## 1. Catch up without reading 18,000 lines

The docs are long. Read in this order and stop when you know enough for your task:

1. `CLAUDE.md` (144 lines): all of it.
2. `docs/DEVLOG.md`: the top two entries only. `CHANGELOG.md`: the `[Unreleased]` section only.
3. `docs/ARCHITECTURE.md`: search it for the modules and events your task touches. It is the source
   of truth for every cross-module API. Do not read it top to bottom.
4. Only if your task is in that area: `docs/STYLE.md` → "The house style" (anything visible),
   `docs/COMBAT.md` (anything about attacks, tells, block / parry / dodge, balance numbers),
   `docs/ARCHITECTURE.md` → "Destruction" (anything that stands in a level or hits something).
5. `docs/DECISIONS.md`: search for the ADR numbers the code comments cite. An ADR explains why a
   thing is the way it is; read the one for the code you are about to change before changing it.

## 2. Where to work

- **Work in your own clone, or your own git worktree made from `origin/main`.** Do not work in the
  repository's root checkout: it sits on an old branch that is already merged.
- **Never touch `.claude/worktrees/`.** It holds about 55 checkouts that belong to other agent
  sessions, some with unfinished work. Do not edit, clean, prune or delete anything there.
- If you do search from the root folder, exclude `.claude/worktrees/`. Each checkout in it is a full
  copy of `src/`, so an unfiltered search returns dozens of copies of every file, most of them stale.
- The dev server uses port 5173 by default and another checkout may already be serving on it. Start
  yours on another port (set the `PORT` environment variable, for example 5200, before
  `npm run dev`) and confirm the page you are looking at is served
  from your folder before you judge a change by it.

## 3. Keeping every change reversible

`main` is protected: no direct pushes, the `test-and-build` check must pass, history is linear.
A squash-merged PR becomes exactly one commit on `main`, and one commit is what makes a clean
revert. The rules below protect that.

**One change, one branch, one PR.**
- Branch from current `origin/main`. Name the branch `gemini/<area>-<short-name>`, for example
  `gemini/combat-parry-window`. The prefix is how the owner finds all of your work later.
- One task per PR. No drive-by fixes, no reformatting, no renames or file moves that the task does
  not need. A revert removes everything in the PR, so anything unrelated in it is lost with it.
- Do not build one PR on top of another unmerged PR of yours. Each PR must be revertable alone. If
  change B truly needs change A, say so in B's description: "reverting #A requires reverting this
  first".
- Open the PR and stop. **The owner merges**, by squash. Do not merge it yourself, do not turn on
  auto-merge, and do not use a rebase merge (it puts several commits on `main` and each would need
  its own revert).
- The PR title becomes the commit subject, so write it in the repository's format
  (`combat: add parry window`). Start the description with the line `Author: Gemini`, then the why.

**End every PR description with a "Rollback" section** that states:
- the files it touches,
- the switch that turns the change off without a revert, if there is one,
- any other PR that depends on it,
- anything a revert would not undo. The right answer is "nothing"; if it is not, ask the owner
  before you open the PR.

**Prefer a switch to a replacement.** This project keeps taste-dependent changes behind a URL
parameter and a Lab row, with today's behaviour as the default (see the look switches in
`CLAUDE.md`). When your change alters how something looks, sounds or feels, add it as an option and
leave the default as it is. Then the owner can compare both, and nothing has to be reverted to get
the old behaviour back.

**Do not do these. A git revert does not undo them.**
- Do not change what the game stores in the player's browser. `localStorage` holds key bindings,
  touch pad layout, Lab preferences, the WHAT'S NEW read marks and move telemetry
  (`abyss.telemetry.v1`). Renaming a key or changing a stored shape rewrites data in browsers that a
  revert cannot restore. If a task needs it, ask first.
- No releases: do not bump `version` or `GAME_VERSION`, do not create or move tags.
- Do not change `.github/`, `vercel.json`, branch protection, repository settings, Vercel project
  settings or environment variables. Do not run `vercel deploy`.
- Do not change `package.json` dependencies or `package-lock.json`.
- Do not regenerate `src/entities/player/heroParts.js` (`npm run hero-parts`): it needs Blender and
  rewrites a large generated file.
- Do not push to, rebase, close or merge anyone else's branch or PR. Check a PR is yours before you
  push to its branch.
- Never force-push. Never delete a branch, a tag or a worktree. Never run `git reset --hard`,
  `git clean` or `git checkout -- .` outside your own checkout: the root folder holds untracked work
  files that exist nowhere else.
- `.env.local` and `.vercel/` are private. Do not read them into a commit, a PR or a log.

## 4. What the repository docs do not tell you

**Numbering collides with parallel work.** ADR and DEVLOG session numbers are taken in order, and
open PRs have already claimed some: ADR-144 to ADR-148 (#82, #84) and ADR-150 (#88). Before you
number an ADR or a session, read the titles of the open PRs (`gh pr list`) as well as `main`, and
take the next number nobody has claimed.

**The history docs conflict on every rebase.** Every PR adds to the top of `docs/DEVLOG.md`,
`CHANGELOG.md`, `docs/DECISIONS.md` and `src/ui/changelog.js`. The owner merges other PRs without
notice, so expect to rebase onto `main` and resolve those four files by keeping both sides. Keep
doc-only work in its own commits, and make the last commit you push a code commit when you need a
fresh Vercel preview (`CLAUDE.md` → "Deployment hygiene").

**Tests that turn red for a reason that is not your logic.**
- The suites seed `Math.random` once per build, and three.js draws object ids from it. Adding one
  object to a default scene shifts every random draw after it, and a timing check in an unrelated
  suite can fail. If an unrelated test goes red after you added an object, run the same test on a
  clean `main` before you conclude anything. `furnaceMaw` is the fragile one.
- The tests treat every backticked word in the event catalogue of `docs/ARCHITECTURE.md` as an
  event name. Do not put backticks around anything there that is not an event.
- The human bosses share one engine (`src/entities/enemies/duelist/`). Before you add a field to a
  move's data, search every boss's move data for that name: `catch` was already the Starless
  Lord's. After any change under `duelist/`, run `duel.mjs`, `lord.mjs` and `asc.mjs` early.

**The owner's taste, learned the hard way.**
- For anything that is a matter of taste (a look, a sound, a layout, a pace), render two or three
  options and let the owner pick from pictures. Do not ask them to choose from a description, and do
  not pick for them.
- The game is 3D drawn in ASCII and stays that way. A 2D sprite trial was stopped the same day it
  started; do not propose sprites or pixel art. Bright, tidy art reads to the owner as "cartoony".
- Do not redraw the Cinder Wyrm. Three full redraws were turned down. It is the reference look.
- Sound effects are synthesised. Recorded samples were tried and judged too noisy.
- Nothing may sit on top of the play area for long: no lasting lock-on marker, no touch control or
  minimap covering the fight.
- Defensive play (blocking, waiting, parrying) must not be punished by a change to balance.
- The hero's attack pace was tuned by hand: 0.25 s felt too fast, 0.42 s too slow. Do not move it
  without showing the owner.
- The owner plays on an iPhone Pro, upright as well as sideways. Check any UI change at a phone
  size in both orientations. Frame rate on the real phone is theirs to confirm, not yours to claim.
- Some bosses are homages. Keep the names of their sources out of the game, the code and the docs.

**Report honestly.** If a test fails, say so and paste the output. If you could not check something
in a browser, say that rather than describing how it should look.

## 5. How a change of yours gets rolled back (for the owner)

Each merged PR is one commit on `main`, so each can be reverted on its own with a new PR:

```bash
# everything merged from gemini/ branches
gh pr list --state merged --limit 200 --json number,title,headRefName --jq '.[] | select(.headRefName | startswith("gemini/")) | "\(.number)  \(.title)"'
# opens the revert PR; CI runs; squash-merge it
gh pr revert <number>
```

The "Revert" button on the merged PR's page does the same thing. Merging the revert redeploys
`main` to production as usual.

- Revert the newest first when several PRs touch the same code.
- If other PRs merged after it, the revert may conflict in the four history docs. Resolve by
  keeping the other PRs' entries and dropping only the reverted PR's.
- To see everything that changed since Gemini started, compare `main` against the commit it started
  from: `git diff 01132fd..origin/main` (01132fd was `main` when this file was written).
