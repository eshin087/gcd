import { registerItem } from '../../player/gear/index.js';
import { BASE_ITEMS } from '../../player/gear/base.js';

// The False Saint's gear (the BODY AGENT's file). WAVE 0: A STAND-IN BODY: the hero's skeleton (buildHero,
// the same animator) in the undersuit's plain dark shirt and trousers, bare hands, his colours from look.js.
// Good enough to see him; the body agent replaces it with the reference's four milestones (the jacket and
// skin over the frame, the shell reading d.shell; BRIEF "The body"), keeping THE BODY CONTRACT below.
//
// THE BODY CONTRACT (what the rules, the fx and the moves read; names unchanged after wave 0):
//   gear.js   FS_LOADOUT   the loadout (player/gear slots → item ids; weapon null: bare-handed)
//             FS_FIST      his "blade": { guard, tip } along the sword joint's +Z (the right fist)
//   look.js   tintSaint(M)              his colours, once after the rig is built (the kit's _tint)
//             dressSaint(d, dt)         every frame (the kit's dress): reads d.dressPhase (1..4) and
//                                       d.shell (shell.js: part(name), exposure, version)
//             eyePoint(d, out)          his (right) eye as drawn (world; finite even with no rig)
//             handPoint(d, side, out)   his right ('R') / left ('L') hand as drawn (world)
//             partPoint(d, name, out)   where a weapon of his frame is, as drawn (world): 'palmR' the
//                                       cannon iris, 'elbowR' / 'elbowL' the boosters, 'shoulderR' /
//                                       'shoulderL' the missile petals, 'back' the back thrusters, 'calfR'
//                                       / 'calfL' the calf thrusters, 'core' the chest's core slit,
//                                       'mortar' the back's mortar tubes, 'eye' the eye, 'head', 'chest'
//             fsLettersOn()             his letters follow his size as the hero's (the kit's `letters`)
//   poses.js  FS_POSES ({ loco, duel }), GUARD, compileClip, completeBeat, CLIPS / REACT / OPEN_CLIPS
//             (merged with the four moves' pose files: poses.js header); FRAGS (STAND, KNEEL ...)
//   the actor (saint.js) carries:
//             d.dressPhase   1..4: the dress shown (core sets it at a transition's impact)
//             d.shell        the shell (shell.js FsShell)
//             d.eyePoint(out), d.handPoint(side, out), d.partPoint(name, out)   the same points

const BASE = Object.fromEntries(BASE_ITEMS.map((it) => [it.slot, it]));

/** The set (registered into the hero's gear registry on import: gear/index.js registerItem). */
export const FS_ITEMS = [
  { id: 'fs.chest', slot: 'chest', name: 'Stand-in Shirt', build: (ctx) => BASE.chest.build(ctx) },
  { id: 'fs.arms', slot: 'arms', name: 'Stand-in Sleeves', build: (ctx) => BASE.arms.build(ctx) },
  { id: 'fs.legs', slot: 'legs', name: 'Stand-in Trousers', build: (ctx) => BASE.legs.build(ctx) },
];
for (const item of FS_ITEMS) registerItem(item);

/** What he wears (no `weapon`: bare-handed; the right fist hangs on the sword joint). */
export const FS_LOADOUT = Object.freeze({
  head: null, chest: 'fs.chest', shoulders: null, arms: 'fs.arms', legs: 'fs.legs', waist: null, back: null, weapon: null,
});

/** His "blade": the right fist along the sword joint's +Z (Tian Lei's and Bai Wuji's measure). */
export const FS_FIST = Object.freeze({ guard: -0.06, tip: 0.075 });
