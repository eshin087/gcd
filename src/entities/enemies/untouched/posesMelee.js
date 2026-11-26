import { X as ASC } from '../ascendant/moves.js';

// Bai Wuji's melee pose fragments and reaction clips (the MELEE AGENT's file). Merged by poses.js (the
// router: its header has the rule). EVERY NAME HERE STARTS WITH `ml` (fragments and clips alike), so
// it never meets a name of the body's poses.js (unprefixed), posesSpells.js (`sp`) or posesTerrain.js
// (`tr`). Do not import poses.js from here (a cycle): build fragments with Tian Lei's `F` (ASC.F).
// Exports: FRAGS { mlName: pose }  · CLIPS { mlName: { dur, hold?, keys: [[t, pose], ...] } } ·
//          REACT { mlName: { travel, side? } } · OPEN [mlName, ...] (clips that leave him open)
const { F } = ASC;

/** The knee drawn up for the stand-in's knee strike (core's small working set). */
export const FRAGS = Object.freeze({
  mlBlinkCrouch: F({ bY: -0.2, pitch: 0.18, hdX: 0.1, rH: [0.06, -0.3, 0.1], lH: [-0.06, -0.3, 0.1], flat: 0.5 }),
});
export const CLIPS = Object.freeze({});
export const REACT = Object.freeze({});
export const OPEN = Object.freeze([]);
