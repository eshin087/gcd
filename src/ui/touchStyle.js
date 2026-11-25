// Touch-controls stylesheet, injected from JS (style.css stays foundation-only). Matches the HUD:
// JetBrains Mono, thin light lines, ember accents; the stick is an ASCII ring of glyphs around an
// '@' knob and every button wears HUD-style corner brackets.
// The controls are drawn ON the game, not over it (ADR-097): no filled panels, faint outlines and
// glyphs at rest (the fight shows through them), full strength only under a thumb.

const LINE = 'rgba(207, 214, 230, 0.30)';
const CORNER = 'rgba(207, 214, 230, 0.55)';
const EMBER = '#ff8a3d';
// four L-shaped corner brackets drawn with gradients (crisp 1px lines, no box-drawing font needed)
const corners = (c, s) =>
  [
    `linear-gradient(${c},${c}) top left / ${s}px 1px no-repeat`,
    `linear-gradient(${c},${c}) top left / 1px ${s}px no-repeat`,
    `linear-gradient(${c},${c}) top right / ${s}px 1px no-repeat`,
    `linear-gradient(${c},${c}) top right / 1px ${s}px no-repeat`,
    `linear-gradient(${c},${c}) bottom left / ${s}px 1px no-repeat`,
    `linear-gradient(${c},${c}) bottom left / 1px ${s}px no-repeat`,
    `linear-gradient(${c},${c}) bottom right / ${s}px 1px no-repeat`,
    `linear-gradient(${c},${c}) bottom right / 1px ${s}px no-repeat`,
  ].join(',');

const CSS = `
html.gcd-touch, html.gcd-touch body {
  touch-action: none;
  overscroll-behavior: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
/* phones render at DPR 1 on LOW: upscale the ASCII frame with crisp pixels, not a blur */
html.gcd-touch #game { cursor: default; image-rendering: pixelated; }
.tc-root {
  --tc-ink: #cfd6e6;
  --tc-dim: #7d879c;
  --tc-ember: ${EMBER};
  --tc-gold: #d8b86a;
  --tc-mono: 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  font-family: var(--tc-mono);
  color: var(--tc-ink);
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.35s ease;
}
.tc-root.off { opacity: 0; visibility: hidden; transition: opacity 0.35s ease, visibility 0s linear 0.35s; }
.tc-root.off * { pointer-events: none !important; }
/* paused: the controls show through the pause screen, inert (PAD POSITION / PAD SIZE are seen) */
.tc-root.off.peek { opacity: 0.85; visibility: visible; z-index: 40; transition: opacity 0.2s ease; }
.tc-root.off.peek .tc-stick, .tc-root.off.peek .tc-pause, .tc-root.off.peek .tc-lock { opacity: 0; }
/* model viewer hides every HUD layer; the touch layer too */
#ui.lab-mv > .tc-root { opacity: 0 !important; }

/* ---------- stick: capture zone (left thumb) + ASCII ring ---------- */
.tc-zone {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 42%;
  height: 74%;
  pointer-events: auto;
  touch-action: none;
}
.tc-stick {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  opacity: 0.4;
  transition: opacity 0.25s ease;
  will-change: transform;
}
.tc-stick.on { opacity: 0.9; transition: opacity 0.05s; }
.tc-disc {
  position: absolute;
  left: -64px;
  top: -64px;
  width: 128px;
  height: 128px;
  border-radius: 50%;
  background: none;
}
.tc-ring > span {
  position: absolute;
  width: 14px;
  height: 16px;
  margin: -8px 0 0 -7px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  line-height: 16px;
  color: rgba(207, 214, 230, 0.7);
  text-shadow: 0 0 2px #000, 0 1px 2px #000;
}
.tc-ring > span.c { color: rgba(232, 236, 245, 0.9); font-size: 11px; font-weight: 700; }
.tc-ring > span.l1 { color: ${EMBER}; text-shadow: 0 0 6px rgba(255, 138, 61, 0.8), 0 1px 2px #000; }
.tc-ring > span.l2 { color: #ffd2a4; text-shadow: 0 0 8px rgba(255, 138, 61, 1), 0 1px 2px #000; }
.tc-stick.sprint .tc-ring > span.l1, .tc-stick.sprint .tc-ring > span.l2 {
  color: var(--tc-gold);
  text-shadow: 0 0 8px rgba(216, 184, 106, 0.95), 0 1px 2px #000;
}
.tc-centre {
  position: absolute;
  left: -5px;
  top: -8px;
  width: 10px;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  color: rgba(207, 214, 230, 0.35);
}
.tc-knob {
  position: absolute;
  left: -19px;
  top: -19px;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  color: #f2e7d2;
  background: rgba(6, 9, 14, 0.12);
  border: 1px solid rgba(207, 214, 230, 0.2);
  text-shadow: 0 0 8px rgba(255, 138, 61, 0.55);
  will-change: transform;
}
.tc-knob::before {
  content: '';
  position: absolute;
  inset: -4px;
  background: ${corners(CORNER, 7)};
}
.tc-stick.on .tc-knob { border-color: rgba(255, 138, 61, 0.6); }
.tc-stick.sprint .tc-knob { color: #fff3c9; border-color: rgba(216, 184, 106, 0.8); text-shadow: 0 0 10px rgba(216, 184, 106, 0.9); }
.tc-tag {
  position: absolute;
  left: -40px;
  top: 78px;
  width: 80px;
  text-align: center;
  font-size: 9px;
  letter-spacing: 0.3em;
  padding-left: 0.3em;
  color: var(--tc-dim);
  text-shadow: 0 1px 2px #000;
}
.tc-stick.sprint .tc-tag { color: var(--tc-gold); }
.tc-stick:not(.sprint) .tc-tag { display: none; }

/* ---------- buttons (right thumb) ---------- */
.tc-btn {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0;
  margin: 0;
  font-family: var(--tc-mono);
  color: var(--tc-ink);
  background: transparent;
  border: 1px solid rgba(207, 214, 230, 0.13);
  border-radius: 0;
  opacity: 0.62;
  pointer-events: auto;
  touch-action: none;
  -webkit-appearance: none;
  appearance: none;
  outline: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.08s, border-color 0.08s, opacity 0.25s;
}
.tc-btn.on { opacity: 1; transition: background 0.05s, border-color 0.05s, opacity 0.05s; }
.tc-btn::before {
  content: '';
  position: absolute;
  inset: -4px;
  pointer-events: none;
  background: ${corners(CORNER, 8)};
}
.tc-btn .g {
  font-size: 22px;
  line-height: 1;
  color: #eef1f8;
  text-shadow: 0 0 3px #000, 0 0 7px rgba(0, 0, 0, 0.85), 0 1px 2px #000;
}
.tc-btn .t {
  font-size: 8px;
  line-height: 10px;
  letter-spacing: 0.2em;
  padding-left: 0.2em;
  color: var(--tc-dim);
  white-space: pre;
  text-shadow: 0 0 3px #000, 0 1px 2px #000;
}
.tc-btn .s { display: none; }
.tc-btn.on {
  background: rgba(255, 138, 61, 0.14);
  border-color: rgba(255, 138, 61, 0.75);
}
.tc-btn.on::before { background: ${corners(EMBER, 8)}; }
.tc-btn.on .g { color: #ffe2cc; text-shadow: 0 0 10px rgba(255, 138, 61, 0.95), 0 1px 2px #000; }
.tc-btn.on .t { color: #ffd2a4; }
.tc-btn.dim { opacity: 0.3; }
.tc-btn.lit { border-color: rgba(255, 138, 61, 0.6); }
.tc-btn.lit .g { color: ${EMBER}; text-shadow: 0 0 8px rgba(255, 138, 61, 0.8); }

/* the pad: one pointer surface under three tiles that all touch (ui/touch.js places and sizes it
   and its tiles from CONFIG.touch.pad; --tc-k is its scale) */
.tc-pad { position: absolute; pointer-events: auto; touch-action: none; }
.tc-tile { pointer-events: none; cursor: default; box-sizing: border-box; }
.tc-tile::before { inset: 3px; opacity: 0.6; }
.tc-tile.on::before { opacity: 1; }
.tc-tile .g { font-size: calc(22px * var(--tc-k, 1)); }
.tc-tile .t { font-size: calc(8px * var(--tc-k, 1)); line-height: 1.3; }
.tc-attack .g { font-size: calc(36px * var(--tc-k, 1)); }
.tc-attack .t { font-size: calc(9px * var(--tc-k, 1)); }
.tc-heavy .g { font-size: calc(30px * var(--tc-k, 1)); }
.tc-heavy .t { font-size: calc(9px * var(--tc-k, 1)); }
.tc-heavy.charge .t { color: var(--tc-gold); letter-spacing: 0.04em; padding-left: 0; }
.tc-heavy.full .t { color: #fff3c9; text-shadow: 0 0 6px rgba(216, 184, 106, 0.9); }
/* BLOCK carries the guard meter: a gauge along its foot (--tc-gd 0..1, written by ui/touch.js) */
.tc-block::after {
  content: '';
  position: absolute;
  left: 7px;
  right: 7px;
  bottom: 4px;
  height: 2px;
  background: linear-gradient(90deg, #dfe7f5, #dfe7f5) left / calc(var(--tc-gd, 1) * 100%) 100% no-repeat, rgba(207, 214, 230, 0.16);
}
.tc-block.low::after { background: linear-gradient(90deg, #ff9a5a, #ff9a5a) left / calc(var(--tc-gd, 1) * 100%) 100% no-repeat, rgba(255, 138, 61, 0.2); }
.tc-block.low { border-color: rgba(255, 138, 61, 0.55); }
.tc-block { padding-bottom: 5px; }
/* PAD LAYOUT split (ADR-131): the guard is the left hand's, a button of its own beside the stick */
.tc-guard { display: none; box-sizing: border-box; padding-bottom: 5px; }
.tc-root.split .tc-guard { display: flex; }
.tc-root.split .tc-block { display: none; }
.tc-guard .g { font-size: calc(26px * var(--tc-k, 1)); }
.tc-guard .t { font-size: calc(9px * var(--tc-k, 1)); line-height: 1.3; }
.tc-guard::after {
  content: '';
  position: absolute;
  left: 7px;
  right: 7px;
  bottom: 4px;
  height: 2px;
  background: linear-gradient(90deg, #dfe7f5, #dfe7f5) left / calc(var(--tc-gd, 1) * 100%) 100% no-repeat, rgba(207, 214, 230, 0.16);
}
.tc-guard.low::after { background: linear-gradient(90deg, #ff9a5a, #ff9a5a) left / calc(var(--tc-gd, 1) * 100%) 100% no-repeat, rgba(255, 138, 61, 0.2); }
.tc-guard.low { border-color: rgba(255, 138, 61, 0.55); }
.tc-flask { box-sizing: border-box; }
/* top right, left of the small minimap (phones, either way up) */
.tc-lock { right: 98px; top: 6px; width: 38px; height: 38px; }
.tc-pause { right: 54px; top: 6px; width: 38px; height: 38px; }
.tc-flask .g, .tc-lock .g, .tc-pause .g { font-size: 16px; }
.tc-flask .t, .tc-lock .t { font-size: 7px; letter-spacing: 0.12em; padding-left: 0.12em; }
.tc-lock .t { display: none; }
.tc-flask .g { color: var(--tc-gold); text-shadow: 0 0 6px rgba(216, 184, 106, 0.45); }

/* tablets: the minimap is full size there */
@media (min-height: 561px) and (min-width: 561px) {
  .tc-lock { right: 142px; top: 12px; }
  .tc-pause { right: 96px; top: 12px; }
}

/* ---------- a screen held upright: the left thumb's zone is the lower left ---------- */
@media (orientation: portrait) {
  .tc-zone { width: 50%; height: 46%; }
}
`;

export function injectTouchStyle() {
  if (typeof document === 'undefined' || document.getElementById?.('ab-touch-style')) return;
  const style = document.createElement('style');
  style.id = 'ab-touch-style';
  style.textContent = CSS;
  (document.head ?? document.body)?.appendChild(style);
}
