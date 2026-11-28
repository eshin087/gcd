// The False Saint's arsenal pose fragments and reaction clips (the ARSENAL AGENT's file). Merged by poses.js
// (the router: its header has the rule). EVERY NAME HERE STARTS WITH `ar` (fragments and clips
// alike), so it never meets a name of the body's poses.js (unprefixed) or another moves file's (ml / bo /
// ar / tr). Do not import poses.js from here (a cycle): build fragments with Tian Lei's `F`
// (ascendant/moves.js X) or partial channel objects laid over the body's STAND (`{ ...FRAGS.STAND, ...frag }`).
// Exports: FRAGS { arName: pose } · CLIPS { arName: { dur, hold?, keys: [[t, pose], ...] } } ·
//          REACT { arName: { travel, side? } } · OPEN [arName, ...] (clips that leave him open)
// (Body space as ascendant/moves.js: +x his LEFT, +y up, +z forward; hands offsets from each shoulder,
// feet model space [x, z] or [x, y, z].) Empty today (wave 0).
export const FRAGS = Object.freeze({});
export const CLIPS = Object.freeze({});
export const REACT = Object.freeze({});
export const OPEN = Object.freeze([]);
