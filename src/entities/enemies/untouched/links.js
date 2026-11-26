import { FILE_LINKS } from './moves.js';

// Bai Wuji's combo links (duelist/brain.js header: { from: [{ to, when, chance, force, band, cut }] }).
// Each move file keeps the links of its own moves (its `LINKS` export; moves.js merges them in file
// order: melee, spells, terrain). This file adds core's: none today (the transitions never link).
export const LINKS = Object.freeze({ ...FILE_LINKS });
