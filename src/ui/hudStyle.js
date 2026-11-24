import { TELL_STYLE } from '../combat/rules.js';

// HUD stylesheet, injected from JS so the module owns its look (style.css stays foundation-only).
// An ASCII overlay (ADR-098): monospace text drawn straight on the game. In play nothing has a
// panel: the meters are rows of characters (ui/glyphBar.js), the big words block letters
// (ui/blockText.js). Menus and the desktop log keep thin 1px borders and translucent dark panels.
// Tell colours come from TELL_STYLE (src/combat/rules.js) so HUD, FX and the Lab agree.

/** '#rrggbb' -> 'rgba(r, g, b, a)'. */
function rgba(hex, a) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const n = parseInt(full, 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
const BLUE = TELL_STYLE.blue.css;
const RED = TELL_STYLE.red.css;
const FLARE_BLUE = TELL_STYLE.blue.css; // the blue flare's edge (a parry moment, ADR-118)
const WHITE = TELL_STYLE.normal.css;
const CYAN = '#7ff6ff';
// text drawn on the game with no panel behind it: a dark halo keeps it readable over lit ground
const SHADOW = '0 0 3px #000, 0 1px 2px #000';

const CSS = `
.ab-root {
  --ab-ink: #cfd6e6;
  --ab-dim: #7d879c;
  --ab-faint: #4f586b;
  --ab-ember: #ff8a3d;
  --ab-blood: #b3261e;
  --ab-gold: #d8b86a;
  --ab-line: rgba(207, 214, 230, 0.18);
  --ab-panel: rgba(6, 9, 14, 0.72);
  --ab-mono: 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Courier New', monospace;
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  font-family: var(--ab-mono);
  font-size: 11px;
  line-height: 1.35;
  color: var(--ab-ink);
  letter-spacing: 0.02em;
  -webkit-font-smoothing: antialiased;
}
.ab-root * { box-sizing: border-box; }
.ab-panel {
  background: var(--ab-panel);
  border: 1px solid var(--ab-line);
}
.ab-play { transition: opacity 0.9s ease; }
.ab-root[data-state='title'] .ab-play { opacity: 0; }
.ab-root[data-state='dead'] .ab-play { opacity: 0.28; }

.ab-key {
  display: inline-block;
  min-width: 15px;
  padding: 0 4px;
  margin: 0 1px;
  border: 1px solid rgba(207, 214, 230, 0.38);
  border-radius: 2px;
  background: rgba(207, 214, 230, 0.05);
  color: #e8ecf5;
  font-size: 10px;
  line-height: 13px;
  text-align: center;
  letter-spacing: 0;
}

/* ---------- text meters (ui/glyphBar.js): a run of fill, the piece just lost, the empty rest ---------- */
.ab-gbar {
  display: inline-block;
  position: relative;
  flex: none;
  white-space: pre;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0;
  text-shadow: ${SHADOW};
}
.ab-gbar .e { color: rgba(150, 160, 182, 0.72); font-weight: 400; }
/* a meter's ends: [ and ] (not the posture, which grows from its middle) */
.ab-gbar:not(.post)::before { content: '['; color: #8f99ad; font-weight: 400; }
.ab-gbar:not(.post)::after { content: ']'; color: #8f99ad; font-weight: 400; }
.ab-gbar .tick { position: absolute; top: 0; font-style: normal; transform: translateX(-50%); color: #fff2e0; }
.ab-gbar.hp .f { color: #e8584a; text-shadow: 0 0 7px rgba(232, 88, 74, 0.45), ${SHADOW}; }
.ab-gbar.hp .c { color: #ffe1cf; }
.ab-gbar.hp.low .f { animation: ab-pulse 0.9s ease-in-out infinite; }
.ab-gbar.guard .f { color: #dfe7f5; }
.ab-gbar.guard .c { color: #ffc078; }
.ab-gbar.guard.low .f { color: #ff9a5a; }
.ab-gbar.guard.open { animation: ab-guard-open 0.6s ease-out; }
@keyframes ab-guard-open { 20% { filter: brightness(2.2) drop-shadow(0 0 6px #ff6a3d); } }
.ab-gbar.crit .f { color: ${CYAN}; text-shadow: 0 0 7px ${rgba(CYAN, 0.8)}, ${SHADOW}; }
.ab-gbar.boss .f { color: #d8463a; text-shadow: 0 0 8px rgba(216, 70, 58, 0.5), ${SHADOW}; }
.ab-gbar.boss .c { color: #f0d29a; }
.ab-boss.p2 .ab-gbar.boss .f { color: #ff9a45; text-shadow: 0 0 9px rgba(255, 138, 61, 0.6), ${SHADOW}; }
.ab-boss.p3 .ab-gbar.boss .f { color: #fff0c4; text-shadow: 0 0 10px rgba(255, 210, 140, 0.75), ${SHADOW}; }
.ab-gbar.post { font-size: 0.82em; }
.ab-gbar.post .f { color: #e9cc7a; }
.ab-gbar.post .e { color: rgba(216, 184, 106, 0.3); }
.ab-gbar.post.hot .f { text-shadow: 0 0 7px rgba(255, 196, 90, 0.8), ${SHADOW}; }
.ab-gbar.post.hit .f { color: #fff6dc; }
.ab-gbar.post.break { animation: ab-post-break 0.7s ease-out; }
.ab-boss.broken .ab-gbar.post .f { animation: ab-pulse 0.5s ease-in-out infinite; }
@keyframes ab-pulse { 50% { filter: brightness(1.55); } }
@keyframes ab-post-break { 0%, 100% { filter: none; } 25% { filter: brightness(2.4) drop-shadow(0 0 8px rgba(255, 196, 90, 0.9)); } }

/* ---------- the player's rows (top-left): no panel, text on the game ---------- */
.ab-pf {
  position: absolute;
  left: 14px;
  top: 12px;
  font-size: 13px;
  text-shadow: ${SHADOW};
  z-index: 2;
}
.ab-row { display: flex; align-items: center; gap: 1ch; line-height: 1.3; }
.ab-row .lbl { width: 2ch; font-weight: 700; color: #aab3c6; }
.ab-row .val { width: 9ch; white-space: nowrap; color: var(--ab-ink); font-variant-numeric: tabular-nums; }
/* a narrow touch screen (ui/hud.js _fit): shorter meters, the HP number alone */
.ab-compact .ab-row .val { width: 4ch; }
.ab-pf-foot { display: flex; align-items: center; gap: 3ch; margin-top: 2px; }
.ab-pips { display: inline-block; letter-spacing: 0.14em; font-size: 0.85em; }
.ab-pips .full { color: var(--ab-gold); text-shadow: 0 0 6px rgba(216, 184, 106, 0.45); }
.ab-pips .empty { color: #4a5263; }
.ab-pips.flash { animation: ab-shake 0.4s ease-out; }
@keyframes ab-shake {
  20% { transform: translateX(-2px); color: #ff8a3d; }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-1px); }
}
.ab-lock {
  letter-spacing: 0.14em;
  color: var(--ab-ember);
  opacity: 0;
  transition: opacity 0.18s;
}
.ab-lock.on { opacity: 1; }
/* crit window (after a Ghostep): a hidden row that lights up cyan */
.ab-crit { opacity: 0; transition: opacity 0.12s; }
.ab-crit.on { opacity: 1; }
.ab-crit .clbl { font-weight: 700; letter-spacing: 0.12em; color: ${CYAN}; white-space: nowrap; }
.ab-crit.on .clbl { animation: ab-crit-glow 0.5s ease-in-out infinite alternate; }
@keyframes ab-crit-glow {
  from { text-shadow: 0 0 3px ${rgba(CYAN, 0.5)}; }
  to { text-shadow: 0 0 9px ${rgba(CYAN, 1)}, 0 0 2px #fff; }
}
/* the streak of perfect dodges: a pip for every blow the next flurry strikes, the count beside them */
.ab-streak { opacity: 0; transition: opacity 0.2s; }
.ab-streak.on { opacity: 1; }
.ab-streak .slbl { font-weight: 700; letter-spacing: 0.12em; color: #cfe9ff; white-space: nowrap; }
.ab-streak .spips { flex: none; font-size: 0.85em; letter-spacing: 0.2em; white-space: nowrap; }
.ab-streak .spips .full { color: ${CYAN}; text-shadow: 0 0 6px ${rgba(CYAN, 0.9)}; }
.ab-streak .spips .empty { color: #3d4658; }
.ab-streak.hot .spips .full { color: #ffe09a; text-shadow: 0 0 7px rgba(255, 196, 90, 0.95); }
.ab-streak .sval {
  width: 30px;
  text-align: right;
  font-size: 12px;
  font-weight: 800;
  font-style: italic;
  color: #fff;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 8px ${rgba(CYAN, 0.95)};
  transform-origin: 100% 50%;
}
.ab-streak.up .sval { animation: ab-streak-up 0.4s cubic-bezier(0.2, 1.4, 0.4, 1); }
.ab-streak.up .spips .full { animation: ab-crit-glow 0.4s ease-out; }
.ab-streak.lost { animation: ab-streak-lost 0.7s ease-out; }
@keyframes ab-streak-up {
  0% { transform: scale(2.2); color: #fff; }
  100% { transform: scale(1); }
}
@keyframes ab-streak-lost {
  0% { opacity: 1; filter: grayscale(1) brightness(1.5); transform: translateX(-3px); }
  15% { transform: translateX(3px); }
  30% { transform: translateX(-2px); }
  100% { opacity: 0; filter: grayscale(1); transform: none; }
}

/* ---------- minimap (top-right) ---------- */
.ab-map {
  position: absolute;
  right: 12px;
  top: 12px;
  text-align: center;
  opacity: 0.6;
  z-index: 2;
}
.ab-map-zone, .ab-map-line:not(.fps) { display: none; }
.ab-map canvas { display: block; width: 72px; height: 72px; margin: 0 auto; }
.ab-map-line { font-size: 9px; color: var(--ab-dim); margin-top: 2px; font-variant-numeric: tabular-nums; }
.ab-map-line.fps { color: #9fd18b; display: none; }
.ab-map-line.fps.on { display: block; }
/* the boss rush's line under the disc (ADR-179): the fight's number and the rush's time */
.ab-map-line.rush { display: none; color: #d9dfec; letter-spacing: 0.08em; font-size: 10px; }
.ab-map-line.rush.on { display: block; }

/* ---------- log (bottom-left) ---------- */
.ab-log {
  position: absolute;
  left: 14px;
  bottom: 14px;
  width: 330px;
  padding-bottom: 6px;
  z-index: 2;
}
.ab-tabs { display: flex; border-bottom: 1px solid var(--ab-line); pointer-events: auto; }
.ab-root[data-state='title'] .ab-tabs { pointer-events: none; }
.ab-tab {
  padding: 3px 9px;
  font-size: 10px;
  color: var(--ab-dim);
  cursor: pointer;
  border-right: 1px solid var(--ab-line);
}
.ab-tab:hover { color: var(--ab-ink); }
.ab-tab.on { color: #eef1f8; background: rgba(207, 214, 230, 0.07); }
.ab-lines {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 118px;
  padding: 5px 9px 0;
}
.ab-ln {
  font-size: 11px;
  line-height: 15px;
  padding: 0.5px 0;
  word-break: break-word;
  animation: ab-in 0.25s ease-out, ab-age 1.4s ease 12s forwards;
}
.ab-ln .ts { color: var(--ab-faint); margin-right: 6px; }
.ab-ln .cnt { color: var(--ab-dim); margin-left: 6px; }
.ab-ln.ch-system { color: var(--ab-dim); }
.ab-ln.ch-combat { color: var(--ab-ink); }
.ab-ln.ch-combat b { color: #f4d7a6; font-weight: 700; }
.ab-ln.ch-warn { color: var(--ab-ember); }
.ab-ln.ch-warn b { font-weight: 700; }
.ab-ln.ch-lore { color: var(--ab-gold); }
@keyframes ab-in { from { opacity: 0; transform: translateX(-6px); } }
@keyframes ab-age { to { opacity: 0.32; } }

/* ---------- boss bar (bottom-centre) ---------- */
/* the boss's rows: top centre (between the player's rows and the minimap) */
.ab-boss {
  position: absolute;
  left: 50%;
  top: 14px;
  font-size: clamp(10px, 1.15vw, 15px);
  text-align: center;
  white-space: nowrap;
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 1.1s ease;
  z-index: 3;
}
.ab-boss.on { opacity: 1; }
.ab-boss-head { display: flex; justify-content: center; align-items: flex-end; gap: 2ch; margin-bottom: 1px; }
.ab-boss-name {
  font-weight: 700;
  font-size: 0.86em;
  letter-spacing: 0.3em;
  color: #ebe3d3;
  text-shadow: 0 1px 2px #000, 0 0 10px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
}
.ab-boss-lives { display: inline-flex; gap: 7px; margin: 0 auto 3px 14px; align-self: center; }
.ab-boss-lives .life {
  width: 7px; height: 7px; transform: rotate(45deg);
  background: #ff3b2f; box-shadow: 0 0 7px rgba(255, 70, 50, 0.8);
  transition: background 0.4s, box-shadow 0.4s;
}
.ab-boss-lives .life.gone { background: transparent; box-shadow: inset 0 0 0 1px rgba(207, 214, 230, 0.3); }
/* a foe's streak of guards: pips after his name; lit and pulsing once his flurry may come */
.ab-boss-streak {
  margin: 0 0 3px 12px;
  align-self: center;
  font-size: 9px;
  letter-spacing: 0.22em;
  color: #d98c78;
  opacity: 0;
  transition: opacity 0.2s;
}
.ab-boss-streak.on { opacity: 0.9; }
.ab-boss-streak.ready { color: #ff5a44; text-shadow: 0 0 8px rgba(255, 74, 58, 0.95); animation: ab-foe-streak 0.45s ease-in-out infinite alternate; }
@keyframes ab-foe-streak {
  from { opacity: 0.65; }
  to { opacity: 1; }
}
/* the flurry's screen cut: a line of light thrown across the whole frame, gone in a fifth of a second */
.ab-slash {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 170vmax;
  height: 2px;
  margin: -1px 0 0 -85vmax;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), #ffffff 28%, #e6f8ff 50%, #ffffff 72%, rgba(255, 255, 255, 0));
  box-shadow: 0 0 12px 2px ${rgba(CYAN, 0.7)};
  opacity: 0;
  pointer-events: none;
  z-index: 3;
  transform: rotate(var(--a, 0deg)) scaleX(0);
}
.ab-slash.big { height: 5px; margin-top: -2px; box-shadow: 0 0 26px 6px ${rgba(CYAN, 0.85)}; }
.ab-slash.go { animation: ab-slash 0.2s cubic-bezier(0.1, 0.9, 0.2, 1); }
.ab-slash.big.go { animation-duration: 0.3s; }
@keyframes ab-slash {
  0% { opacity: 0.85; transform: rotate(var(--a, 0deg)) scaleX(0.04); }
  30% { opacity: 0.85; transform: rotate(var(--a, 0deg)) scaleX(1); }
  100% { opacity: 0; transform: rotate(var(--a, 0deg)) scaleX(1) scaleY(0.15); }
}
.ab-boss-dmg {
  font-size: 0.86em;
  color: #f4e8d0;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 2px #000, 0 0 8px rgba(0, 0, 0, 0.9);
  opacity: 0;
  transition: opacity 0.5s ease;
}
.ab-boss-dmg.on { opacity: 1; transition: opacity 0.06s; }
.ab-boss.p2 .ab-boss-name { color: #ffd2a4; }
/* a long name on a short line (ui/hud.js _fit) */
.ab-boss.tight .ab-boss-name { letter-spacing: 0.08em; }
.ab-boss.tight .ab-boss-head { gap: 1ch; }
.ab-boss.tight .ab-boss-lives { gap: 5px; margin-left: 6px; }
/* posture: a run of '=' under the HP meter that grows from its middle toward a break */
.ab-boss-post { position: relative; display: flex; justify-content: center; margin-top: 1px; }
.ab-broken {
  position: absolute;
  left: 50%;
  top: 100%;
  margin-top: 3px;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4em;
  padding-left: 0.4em;
  color: #ffe09a;
  text-shadow: 0 0 8px rgba(255, 200, 90, 0.9), 0 1px 2px #000;
  opacity: 0;
  transition: opacity 0.15s;
}
.ab-boss.broken .ab-broken { opacity: 1; animation: ab-pulse 0.5s ease-in-out infinite; }

/* ---------- interaction prompt ---------- */
.ab-prompt {
  position: absolute;
  left: 50%;
  bottom: 94px;
  transform: translateX(-50%);
  padding: 5px 14px;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.25s ease;
  z-index: 3;
}
.ab-prompt.on { opacity: 1; }
/* victory: the boss bar is gone and the record panel sits below centre, so drop "[R] Fight again" */
.ab-root[data-state='victory'] .ab-prompt { bottom: 40px; }

/* ---------- world-anchored name tags ---------- */
.ab-tags { position: absolute; inset: 0; overflow: hidden; z-index: 1; }
.ab-tag { position: absolute; left: 0; top: 0; visibility: hidden; will-change: transform; }
.ab-tag.on { visibility: visible; }
.ab-tag > span {
  display: block;
  transform: translate(-50%, -100%);
  font-size: 11px;
  white-space: nowrap;
  color: #f4f6fb;
  text-shadow: 0 0 2px #000, 0 1px 2px #000, 0 0 7px rgba(0, 0, 0, 0.9);
}
.ab-tag.foe > span { color: #ffd6c8; }

/* ---------- screen-edge cues: red (dodge-only timing flash) / cyan (Ghostep) ---------- */
.ab-edges { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.ab-edge { position: absolute; opacity: 0; will-change: opacity; }
.ab-edge.l { left: 0; top: 0; bottom: 0; width: 16vw; background: linear-gradient(90deg, ${rgba(RED, 0.55)}, ${rgba(RED, 0)}); }
.ab-edge.r { right: 0; top: 0; bottom: 0; width: 16vw; background: linear-gradient(270deg, ${rgba(RED, 0.55)}, ${rgba(RED, 0)}); }
.ab-edge.t { left: 0; right: 0; top: 0; height: 16vh; background: linear-gradient(180deg, ${rgba(RED, 0.5)}, ${rgba(RED, 0)}); }
.ab-edge.b { left: 0; right: 0; bottom: 0; height: 16vh; background: linear-gradient(0deg, ${rgba(RED, 0.5)}, ${rgba(RED, 0)}); }
/* the flare's other colours (ADR-118): blue = a parry moment, black = a charged blow (the edges go dark, wider) */
.ab-edges.blue .ab-edge.l { background: linear-gradient(90deg, ${rgba(FLARE_BLUE, 0.55)}, ${rgba(FLARE_BLUE, 0)}); }
.ab-edges.blue .ab-edge.r { background: linear-gradient(270deg, ${rgba(FLARE_BLUE, 0.55)}, ${rgba(FLARE_BLUE, 0)}); }
.ab-edges.blue .ab-edge.t { background: linear-gradient(180deg, ${rgba(FLARE_BLUE, 0.5)}, ${rgba(FLARE_BLUE, 0)}); }
.ab-edges.blue .ab-edge.b { background: linear-gradient(0deg, ${rgba(FLARE_BLUE, 0.5)}, ${rgba(FLARE_BLUE, 0)}); }
.ab-edges.black .ab-edge.l { width: 30vw; background: linear-gradient(90deg, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0)); }
.ab-edges.black .ab-edge.r { width: 30vw; background: linear-gradient(270deg, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0)); }
.ab-edges.black .ab-edge.t { height: 30vh; background: linear-gradient(180deg, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0)); }
.ab-edges.black .ab-edge.b { height: 30vh; background: linear-gradient(0deg, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0)); }
.ab-edge-cool {
  position: absolute;
  inset: 0;
  opacity: 0;
  box-shadow: inset 0 0 18vh ${rgba(CYAN, 0.45)};
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 55%, ${rgba('#2a6f8a', 0.25)});
  will-change: opacity;
}

/* ---------- call-outs over the player + damage numbers ---------- */
.ab-calls { position: absolute; inset: 0; overflow: hidden; z-index: 2; }
.ab-call, .ab-num {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  transform-origin: 0 0;
  will-change: transform, opacity;
}
.ab-call.on, .ab-num.on { visibility: visible; }
.ab-call > .t, .ab-num > .t {
  position: relative;
  display: block;
  transform: translate(-50%, -100%);
  white-space: nowrap;
  font-weight: 800;
  text-shadow: 0 0 2px #000, 0 1px 2px #000;
}
.ab-call > .t { font-size: clamp(14px, 1.15vw, 19px); letter-spacing: 0.24em; padding-left: 0.24em; }
.ab-call > .streak {
  position: absolute;
  left: -70px;
  width: 140px;
  top: -11px;
  height: 2px;
  transform: scaleX(0);
  background: linear-gradient(90deg, ${rgba(CYAN, 0)}, ${rgba(CYAN, 0.95)} 45%, #ffffff 50%, ${rgba(CYAN, 0.95)} 55%, ${rgba(CYAN, 0)});
  box-shadow: 0 0 8px ${rgba(CYAN, 0.9)};
}
.ab-call.k-parry > .t { color: #fff6e6; text-shadow: 0 0 10px rgba(255, 226, 170, 0.95), 0 0 2px #000, 0 1px 2px #000; }
.ab-call.k-return > .t { color: #ffd98a; font-size: clamp(16px, 1.3vw, 22px); text-shadow: 0 0 12px rgba(255, 196, 90, 1), 0 0 24px rgba(255, 150, 40, 0.6), 0 0 2px #000; }
.ab-call.k-danger > .t { color: #ffd6c8; font-size: clamp(15px, 1.2vw, 20px); text-shadow: 0 0 12px rgba(255, 96, 40, 1), 0 0 24px rgba(255, 60, 20, 0.6), 0 0 2px #000; }
.ab-call.k-deflect > .t { color: #e8f4ff; font-size: clamp(16px, 1.3vw, 22px); text-shadow: 0 0 12px ${rgba(BLUE, 1)}, 0 0 24px ${rgba(BLUE, 0.6)}, 0 0 2px #000; }
.ab-call.k-ghostep > .t { color: ${CYAN}; font-size: clamp(16px, 1.3vw, 22px); font-style: italic; text-shadow: 0 0 12px ${rgba(CYAN, 1)}, -8px 0 10px ${rgba(CYAN, 0.45)}, 0 0 2px #000; }
.ab-call.k-gbreak > .t { color: #ff6a55; text-shadow: 0 0 10px ${rgba(RED, 0.95)}, 0 0 2px #000, 0 1px 2px #000; }
.ab-call.k-block > .t { color: #b9c3d8; font-size: 11px; font-weight: 700; letter-spacing: 0.3em; }
.ab-num > .t { font-size: 12px; color: #f2e9d8; font-variant-numeric: tabular-nums; }
.ab-num.k-heavy > .t { font-size: 14px; color: #ffd08a; }
.ab-num.k-crit > .t { font-size: clamp(15px, 1.2vw, 19px); color: ${CYAN}; text-shadow: 0 0 9px ${rgba(CYAN, 0.95)}, 0 0 2px #000, 0 1px 2px #000; }
/* a flurry's cut counter over its target */
.ab-num.k-count > .t {
  font-size: clamp(22px, 2vw, 34px);
  font-style: italic;
  letter-spacing: 0.04em;
  color: #fff;
  text-shadow: 0 0 12px ${rgba(CYAN, 1)}, 0 0 26px ${rgba(CYAN, 0.6)}, 0 0 2px #000, 0 1px 3px #000;
}

/* ---------- the streak counter beside the hero (ui/streakCounter.js; the streak pass's 'counter') ----------
   a small number that pops, holds and fades; its style steps up with the streak's tier (t0 .. t5):
   plain and dim, then a thin underline, then thin strokes either side. Lines, not light. */
.ab-sc { position: absolute; left: 0; top: 0; visibility: hidden; transform-origin: 0 0; will-change: transform, opacity; }
.ab-sc.on { visibility: visible; }
.ab-sc > .b { position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-100%, -50%); }
.ab-sc.sr > .b { transform: translate(0, -50%); }
.ab-sc .row { display: flex; align-items: center; gap: 5px; }
.ab-sc .n {
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: #aab4c6;
  font-variant-numeric: tabular-nums;
  text-shadow: ${SHADOW};
}
.ab-sc .g { display: inline-block; }
.ab-sc .d { color: #9aa6ba; font-size: 11px; font-weight: 700; line-height: 1; text-shadow: ${SHADOW}; }
.ab-sc .k { position: absolute; left: -15%; right: -15%; top: 50%; height: 1px; margin-top: -1px; transform: scaleX(0); display: none; }
.ab-sc .u { display: none; }
.ab-sc .w { display: none; margin-top: 3px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.3em; padding-left: 0.3em; color: #d7c08a; white-space: nowrap; text-shadow: ${SHADOW}; }
.ab-sc.word .w { display: block; }
.ab-sc.t2 .n, .ab-sc.t3 .n { font-size: 15px; color: #e2eaf6; }
.ab-sc.t4 .n { font-size: 16px; color: #f4f8ff; text-shadow: 0 0 5px ${rgba(CYAN, 0.3)}, ${SHADOW}; }
.ab-sc.t5 .n { font-size: 17px; color: #ffe9b8; text-shadow: 0 0 5px rgba(255, 196, 90, 0.3), ${SHADOW}; }
/* look 'lines' (drawn): an underline from tier 2, two strokes either side from tier 4 */
.ab-sc-lines.t2 .u, .ab-sc-lines.t3 .u { display: block; width: 2.4em; height: 1px; margin-top: 3px; background: linear-gradient(90deg, ${rgba(CYAN, 0)}, ${rgba(CYAN, 0.75)} 50%, ${rgba(CYAN, 0)}); font-size: 15px; }
.ab-sc-lines.t4 .d, .ab-sc-lines.t5 .d { display: block; width: 12px; height: 1px; background: linear-gradient(90deg, ${rgba(CYAN, 0)}, ${rgba(CYAN, 0.85)}); }
.ab-sc-lines.t4 .d.r, .ab-sc-lines.t5 .d.r { background: linear-gradient(270deg, ${rgba(CYAN, 0)}, ${rgba(CYAN, 0.85)}); }
.ab-sc-lines.t5 .d { width: 18px; background: linear-gradient(90deg, rgba(255, 224, 154, 0), rgba(255, 224, 154, 0.9)); }
.ab-sc-lines.t5 .d.r { background: linear-gradient(270deg, rgba(255, 224, 154, 0), rgba(255, 224, 154, 0.9)); }
/* look 'ticks': a dot under the number for every tier reached */
.ab-sc-ticks .u { display: block; margin-top: 1px; font-size: 10px; line-height: 0.8; letter-spacing: 0.18em; padding-left: 0.18em; color: ${CYAN}; text-shadow: ${SHADOW}; }
.ab-sc-ticks.t5 .u { color: #ffe09a; }
/* a lost streak: grey, struck through, the digits parting as it falls */
.ab-sc.lost .n { color: #8b93a3; text-shadow: ${SHADOW}; }
.ab-sc.lost .k { display: block; background: #c4594a; box-shadow: 0 1px 1px #000; transform-origin: 0 50%; }
.ab-sc.lost.t4 .n, .ab-sc.lost.t5 .n { color: #a2a9b6; }

/* ---------- small mid-screen banner (POSTURE BROKEN) ---------- */
.ab-mini {
  position: absolute;
  left: 50%;
  top: 34%;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(-50%);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  z-index: 4;
}
.ab-mini.on { visibility: visible; }
.ab-mini .txt {
  display: flex;
  align-items: center;
  gap: 14px;
  font-weight: 700;
  font-size: clamp(15px, 1.4vw, 23px);
  letter-spacing: 0.32em;
  padding-left: 0.32em;
  color: #ffe09a;
  white-space: nowrap;
  text-shadow: 0 0 14px rgba(255, 196, 90, 0.75), 0 1px 3px #000;
}
.ab-mini .txt::before,
.ab-mini .txt::after { content: ''; width: 70px; height: 1px; background: linear-gradient(90deg, rgba(255, 224, 154, 0), rgba(255, 224, 154, 0.85)); }
.ab-mini .txt::after { background: linear-gradient(270deg, rgba(255, 224, 154, 0), rgba(255, 224, 154, 0.85)); }
.ab-mini .sub { margin-top: 4px; font-size: 10px; letter-spacing: 0.3em; color: #d7c08a; text-shadow: 0 1px 2px #000; }
/* a long streak's flurry (the streak pass's 'tiers'): never bigger, only a rule more. Tier 4: a thin
   rule under the line beneath; tier 5: longer side rules and a thin rule over the name as well */
.ab-mini.t4 .sub::after, .ab-mini.t5 .sub::after {
  content: '';
  display: block;
  width: 60%;
  height: 1px;
  margin: 5px auto 0;
  background: linear-gradient(90deg, rgba(255, 224, 154, 0), rgba(255, 224, 154, 0.7) 50%, rgba(255, 224, 154, 0));
}
.ab-mini.t5 .txt::before, .ab-mini.t5 .txt::after { width: 110px; }
.ab-mini .over { display: none; width: 70%; height: 1px; margin-bottom: 5px; background: linear-gradient(90deg, rgba(255, 224, 154, 0), rgba(255, 224, 154, 0.55) 50%, rgba(255, 224, 154, 0)); }
.ab-mini.t5 .over { display: block; }
.ab-reticle > span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  font-size: 15px;
  line-height: 1;
  color: #ffd2a8;
  text-shadow: 0 0 4px rgba(255, 138, 61, 0.7), 0 0 2px #000;
  /* centred by the negative margin; the base tag translate must not leak into the spin keyframes */
  transform: none;
  animation: ab-spin 5s linear infinite;
}
/* (its opacity is written by ui/nameTags.js: shown faintly when the lock is taken, then gone) */
.ab-reticle { opacity: 0; }
@keyframes ab-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ---------- centre banners ---------- */
.ab-banner {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0;
  visibility: hidden;
  z-index: 5;
}
.ab-banner .band {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 160px;
  transform: translateY(-50%);
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.74) 30%, rgba(0, 0, 0, 0.74) 70%, rgba(0, 0, 0, 0));
}
.ab-banner .txt {
  position: relative;
  display: flex;
  align-items: center;
  gap: 22px;
  white-space: nowrap;
  will-change: transform;
}
/* the big words are block letters built from characters (ui/blockText.js; ui/banner.js sizes them
   to the screen); the plain text stays in the DOM, unseen */
.ab-banner .txt .t { display: none; }
.ab-banner .blk {
  margin: 0;
  font-family: 'Cascadia Mono', Consolas, Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace;
  font-weight: 400;
  line-height: 1.04;
  letter-spacing: 0;
  white-space: pre;
}
.ab-banner .sub {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  top: 50%;
  margin-top: 54px;
  font-size: 12px;
  letter-spacing: 0.32em;
  color: #b9b2a6;
  white-space: nowrap;
}
.ab-banner .sub.blink { animation: ab-blink 1.8s ease-in-out infinite; }
/* the death screen's recap: the killing move, then what struck him; small lines under the hint */
.ab-banner .recap {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  margin-top: 88px;
  display: none;
  text-align: center;
  font-family: 'Cascadia Mono', Consolas, Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace;
  font-size: 11px;
  line-height: 17px;
  letter-spacing: 0.08em;
  color: #8f897e;
  white-space: nowrap;
  text-shadow: 0 0 6px #000, 0 0 2px #000;
}
.ab-banner .recap.on { display: block; }
.ab-banner .recap .first { color: #d9a39d; letter-spacing: 0.22em; margin-bottom: 5px; }
.ab-banner.k-death .txt {
  color: #b3261e;
  text-shadow: 0 0 26px rgba(130, 10, 6, 0.55);
}
.ab-banner.k-victory .txt {
  color: var(--ab-gold);
  text-shadow: 0 0 22px rgba(216, 184, 106, 0.35);
}
.ab-banner.k-bonfire .txt {
  color: #ffc27a;
  text-shadow: 0 0 20px rgba(255, 138, 61, 0.5);
}
/* a phase call comes in the middle of a fight: small, and above the fighters, not on them */
.ab-banner.k-phase { top: 21%; }
.ab-banner.k-phase .band { display: none; }
.ab-banner.k-phase .txt {
  color: var(--ab-ember);
  text-shadow: 0 0 12px rgba(255, 90, 20, 0.6);
}
.ab-banner.k-area { top: 27%; }
.ab-banner.k-area .band { display: none; }
.ab-banner.k-area .txt {
  color: #ece5d6;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.9), 0 1px 2px #000;
}
.ab-banner.k-area .sub { margin-top: 26px; font-size: 11px; color: #9a9384; }

/* ---------- victory record ---------- */
.ab-stats {
  position: absolute;
  left: 50%;
  top: calc(50% + 84px);
  width: 300px;
  padding: 9px 14px 10px;
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 1.2s ease;
  z-index: 6;
}
.ab-stats.on { opacity: 1; }
.ab-stats-title { text-align: center; font-size: 10px; letter-spacing: 0.3em; color: var(--ab-gold); margin-bottom: 6px; }
.ab-stats .row { display: flex; justify-content: space-between; font-size: 11px; line-height: 17px; }
.ab-stats .row .k { color: var(--ab-dim); }
.ab-stats .row .v { color: #eef1f8; font-variant-numeric: tabular-nums; }
/* the run's grade over the record (ADR-179; ?gradeLook=, ui/recordLooks.js): block letters, the time to
   the hundredth, the marks, NEW BEST, the best before */
.ab-rec-head { text-align: center; margin-bottom: 6px; }
.ab-rec-head:empty { display: none; }
.ab-grade-big {
  margin: 0 auto 4px;
  font-family: 'Cascadia Mono', Consolas, Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace;
  font-size: 13px;
  line-height: 1.02;
  white-space: pre;
  display: inline-block;
  text-align: left;
}
.ab-grade-big.gr-s { color: #f3dc94; text-shadow: 0 0 10px rgba(216, 184, 106, 0.55); }
.ab-grade-big.gr-a { color: var(--ab-ember); text-shadow: 0 0 9px rgba(255, 138, 61, 0.45); }
.ab-grade-big.gr-b { color: #cfd6e6; text-shadow: 0 0 6px rgba(207, 214, 230, 0.3); }
.ab-grade-big.gr-c { color: var(--ab-dim); }
.ab-rec-time { font-size: 15px; letter-spacing: 0.08em; color: #eef1f8; font-variant-numeric: tabular-nums; }
.ab-rec-new { margin-left: 10px; font-size: 10px; letter-spacing: 0.22em; color: var(--ab-ember); text-shadow: 0 0 8px rgba(255, 138, 61, 0.5); }
.ab-rec-marks { margin-top: 3px; font-size: 9.5px; letter-spacing: 0.2em; color: var(--ab-gold); min-height: 1px; }
.ab-rec-prev { margin-top: 3px; font-size: 9.5px; letter-spacing: 0.08em; color: var(--ab-dim); font-variant-numeric: tabular-nums; }
.ab-rec-note { margin-top: 4px; font-size: 9.5px; letter-spacing: 0.08em; color: #c98a7a; }
.ab-rec-row { display: flex; align-items: center; justify-content: center; gap: 14px; }
.ab-rec-head.g-b .ab-rec-side { text-align: left; }
.ab-rec-head.g-b .ab-grade-big { margin: 0; }
.ab-rec-head.g-c .ab-grade-big { font-size: 11px; margin: 0; }
.ab-rec-head.g-c .ab-rec-side { text-align: left; }
.ab-rec-head.g-c .ab-rec-time { font-size: 17px; }
/* with a grade: the grade on the left, the rows beside it in two columns (no taller than the rows were) */
/* (centred by margins, not left: 50% + a shift: a box at left: 50% may only grow to half the screen,
   and its right column spilled past the border; the panel takes its rows' width, at most the screen's,
   and a label too long for what is left is cut short with an ellipsis, never drawn outside) */
.ab-stats.has-head { left: 0; right: 0; margin: 0 auto; transform: none; width: max-content; max-width: 94vw; box-sizing: border-box; display: flex; align-items: center; gap: 22px; padding: 10px 18px 11px; }
.ab-stats.has-head .ab-rec-head { flex: 0 0 auto; margin: 0; }
.ab-stats.has-head .ab-rec-rows { flex: 1 1 auto; min-width: 0; }
.ab-stats.has-head .ab-stats-body { display: grid; grid-template-columns: repeat(2, minmax(0, auto)); column-gap: 22px; }
.ab-stats.has-head .row { gap: 12px; white-space: nowrap; min-width: 0; }
.ab-stats.has-head .row .k { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ab-stats.has-head .row .v { flex: 0 0 auto; }

/* ---------- help + hint ---------- */
.ab-help {
  position: absolute;
  right: 14px;
  top: 262px;
  width: 252px;
  padding: 8px 12px 10px;
  opacity: 0;
  transform: translateX(10px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 10; /* above the title overlay and the pause dimmer (H works on every screen) */
}
.ab-help.on { opacity: 1; transform: none; }
.ab-help-title { display: flex; justify-content: space-between; font-size: 10px; letter-spacing: 0.2em; color: var(--ab-dim); margin-bottom: 7px; }
.ab-hint { position: absolute; right: 14px; bottom: 12px; font-size: 10px; color: var(--ab-faint); z-index: 2; }
.ab-hint .ab-key { color: var(--ab-dim); border-color: rgba(207, 214, 230, 0.2); }
.ab-ctrls { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; text-align: left; font-size: 10.5px; }
.ab-ctrls .k { text-align: right; white-space: nowrap; }
.ab-ctrls .a { color: var(--ab-dim); line-height: 15px; }
.ab-help-sub { margin: 9px 0 3px; font-size: 10px; letter-spacing: 0.2em; color: var(--ab-dim); }
.ab-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 14px; margin-top: 8px; font-size: 10.5px; color: var(--ab-dim); }
.ab-help .ab-legend { justify-content: flex-start; margin-top: 2px; }
.ab-legend .it { white-space: nowrap; }
.ab-legend b { font-weight: 800; }
.ab-legend .n b { color: #ffffff; text-shadow: 0 0 5px ${rgba(WHITE, 0.9)}, 0 0 10px ${rgba(WHITE, 0.5)}; }
.ab-legend .r b { color: ${RED}; text-shadow: 0 0 6px ${rgba(RED, 0.8)}; }
.ab-legend.title { margin-top: 12px; font-size: 11px; text-shadow: 0 1px 2px #000; }
.ab-legend .hint { color: ${CYAN}; opacity: 0.8; }

/* ---------- title ---------- */
.ab-title {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 15vh;
  background:
    radial-gradient(ellipse 72% 58% at 50% 58%, rgba(3, 5, 9, 0.2), rgba(3, 5, 9, 0.84) 82%),
    linear-gradient(180deg, rgba(3, 5, 9, 0.5), rgba(3, 5, 9, 0) 28%, rgba(3, 5, 9, 0) 58%, rgba(3, 5, 9, 0.88));
  transition: opacity 1.1s ease;
  z-index: 8;
}
.ab-title.off { opacity: 0; }
.ab-title.gone { display: none; }
.ab-logo {
  margin: 0;
  font-family: 'Cascadia Mono', Consolas, Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace;
  font-size: clamp(11px, 1.55vw, 24px);
  line-height: 1.04;
  letter-spacing: 0;
  white-space: pre;
  background: linear-gradient(180deg, #f6f1e7 0%, #ddd6c6 38%, #ff9a4a 74%, #a3231a 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 16px rgba(255, 120, 40, 0.28));
}
.ab-title-rule {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  color: var(--ab-ember);
  font-size: 10px;
}
.ab-title-rule::before,
.ab-title-rule::after { content: ''; width: 120px; height: 1px; background: linear-gradient(90deg, rgba(207, 214, 230, 0), rgba(207, 214, 230, 0.45)); }
.ab-title-rule::after { background: linear-gradient(270deg, rgba(207, 214, 230, 0), rgba(207, 214, 230, 0.45)); }
.ab-title-sub { margin-top: 12px; font-size: 12px; letter-spacing: 0.28em; color: #d9dfec; text-shadow: 0 1px 3px #000; }
/* the stage picker (levels/index.js): the current stage lit, another one reloads into it */
.ab-stage { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 16px; pointer-events: auto; }
.ab-stage .ab-btn { display: inline-flex; justify-content: center; width: auto; min-height: 0; margin: 0; font-size: 10.5px; letter-spacing: 0.16em; padding: 6px 12px; color: var(--ab-dim); border-color: rgba(207, 214, 230, 0.18); }
.ab-stage .ab-btn.on { color: #f2e7d2; border-color: var(--ab-ember); text-shadow: 0 0 8px rgba(255, 138, 61, 0.45); cursor: default; }
/* each stage's best (ADR-179; ?recLook=, ui/recordLooks.js) and the BOSS RUSH entry */
.ab-stage .ab-btn { flex-direction: column; align-items: center; }
.ab-stage .ab-stage-best { display: block; margin-top: 3px; font-size: 9px; letter-spacing: 0.08em; color: var(--ab-faint); font-variant-numeric: tabular-nums; }
.ab-stage .ab-stage-best .g { margin-right: 6px; font-weight: 800; }
.ab-stage .ab-btn.has-best .ab-stage-best { color: var(--ab-dim); }
.ab-stage .ab-stage-grade { margin-left: 8px; font-weight: 800; }
.ab-stage .ab-stage-time { display: block; margin-top: 2px; font-size: 9px; letter-spacing: 0.06em; color: var(--ab-dim); font-variant-numeric: tabular-nums; }
.ab-stage .gr-s { color: #f3dc94; text-shadow: 0 0 6px rgba(216, 184, 106, 0.5); }
.ab-stage .gr-a { color: var(--ab-ember); }
.ab-stage .gr-b { color: #cfd6e6; }
.ab-stage .gr-c { color: var(--ab-dim); }
.ab-stage .ab-rush-btn { color: #f2e7d2; border-color: rgba(216, 184, 106, 0.5); }
.ab-stage-shared { margin-top: 9px; min-height: 14px; font-size: 10px; letter-spacing: 0.12em; color: var(--ab-dim); text-shadow: 0 1px 2px #000; font-variant-numeric: tabular-nums; }
.ab-stage-shared .n { color: #d9dfec; }
.ab-stage-shared .g { font-weight: 800; }
.ab-stage-shared .m { color: var(--ab-gold); }
.ab-stage-shared .u, .ab-stage-shared .c { color: var(--ab-faint); }
.ab-stage-shared .gr-s { color: #f3dc94; } .ab-stage-shared .gr-a { color: var(--ab-ember); } .ab-stage-shared .gr-b { color: #cfd6e6; }
.ab-press {
  margin-top: 34px;
  font-size: 12px;
  letter-spacing: 0.42em;
  padding-left: 0.42em;
  color: #f2e7d2;
  text-shadow: 0 0 10px rgba(255, 138, 61, 0.4);
  animation: ab-blink 1.8s ease-in-out infinite;
}
.ab-title-ctrl {
  margin-top: 26px;
  max-width: min(780px, 92vw);
  text-align: center;
  font-size: 10.5px;
  line-height: 22px;
  color: var(--ab-dim);
  text-shadow: 0 1px 2px #000;
}
.ab-title-ctrl .item { white-space: nowrap; margin: 0 7px; }
.ab-credit {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14px;
  text-align: center;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ab-faint);
}
@keyframes ab-blink { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }

/* ---------- pause ---------- */
.ab-pause {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(2, 3, 6, 0.58);
  z-index: 9;
}
.ab-pause.on { display: flex; }
.ab-pause-panel { width: 360px; padding: 18px 22px 16px; text-align: center; pointer-events: auto; }
.ab-pause-title {
  font-weight: 700;
  font-size: 19px;
  letter-spacing: 0.5em;
  padding-left: 0.5em;
  color: #ebe3d3;
  margin-bottom: 14px;
}
.ab-btn {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin: 6px 0;
  padding: 7px 10px;
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--ab-ink);
  background: rgba(207, 214, 230, 0.04);
  border: 1px solid var(--ab-line);
  cursor: pointer;
  pointer-events: auto;
  outline: none;
}
.ab-btn:hover { color: #fff; border-color: rgba(255, 138, 61, 0.6); background: rgba(255, 138, 61, 0.08); }
.ab-btn.primary { color: #fff; }
/* QUIT TO TITLE asks once more before it leaves the fight */
.ab-btn.confirm { color: #fff; border-color: var(--ab-ember); background: rgba(255, 138, 61, 0.12); }
.ab-btn.confirm .v { color: var(--ab-ember); }
.ab-btn .v { color: var(--ab-gold); }
.ab-sep { height: 1px; margin: 14px 0 12px; background: var(--ab-line); }

/* ---------- gamepad in use (src/ui/gamepad.js adds html.abyss-pad) ---------- */
html:not(.abyss-pad) .pad-only { display: none !important; }
html.abyss-pad .kb-only, html.abyss-pad .tp-only { display: none !important; }
.ab-touch:not(.ab-pad) .ab-nontouch { display: none !important; }
.ab-btn.pad-focus { color: #fff; border-color: var(--ab-ember); background: rgba(255, 138, 61, 0.12); box-shadow: 0 0 0 1px rgba(255, 138, 61, 0.35); }
.ab-stage .ab-btn.pad-focus { color: #f2e7d2; border-color: var(--ab-ember); }

/* ---------- the CONTROLS (remap) panel: src/ui/remap.js ---------- */
.ab-pause.remap .ab-pause-panel { display: none; }
.ab-remap { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(2, 3, 6, 0.58); z-index: 10; }
.ab-remap.on { display: flex; }
.ab-remap-panel { width: 400px; max-height: calc(100% - 24px); overflow-y: auto; padding: 18px 22px 14px; text-align: center; pointer-events: auto; }
.ab-remap-tabs { display: flex; gap: 8px; margin-bottom: 8px; }
.ab-remap-tabs .ab-btn { justify-content: center; margin: 0; color: var(--ab-dim); }
.ab-remap-tabs .ab-btn.on { color: #fff; border-color: var(--ab-ember); }
.ab-remap-list .ab-btn { margin: 3px 0; padding: 5px 10px; font-size: 10.5px; }
.ab-remap-list .ab-btn .n { color: var(--ab-dim); }
.ab-remap-list .ab-btn .v { color: var(--ab-gold); letter-spacing: 0.08em; }
.ab-remap-list .ab-btn.wait { border-color: var(--ab-ember); background: rgba(255, 138, 61, 0.1); }
.ab-remap-list .ab-btn.wait .v { color: #fff; animation: ab-blink 1.2s ease-in-out infinite; }
.ab-remap-hint { margin: 8px 0 4px; min-height: 14px; font-size: 10px; color: var(--ab-faint); letter-spacing: 0.06em; }
.ab-remap-hint.warn { color: var(--ab-ember); }
.ab-remap-foot { display: flex; gap: 8px; }
.ab-remap-foot .ab-btn { justify-content: center; margin: 4px 0 0; }
.ab-remap-foot .ab-btn.dim { opacity: 0.45; }

/* ---------- WHAT'S NEW: src/ui/changelogPanel.js (title + pause menu) ---------- */
.ab-pause.news .ab-pause-panel { display: none; }
.ab-news { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(2, 3, 6, 0.72); z-index: 45; pointer-events: auto; } /* over the touch controls' pause peek (z 40) */
.ab-news.on { display: flex; }
.ab-news-panel { width: min(560px, calc(100% - 24px)); max-height: calc(100% - 24px); display: flex; flex-direction: column; padding: 16px 20px 12px; pointer-events: auto; background: rgba(6, 9, 14, 0.9); }
.ab-news-head { text-align: center; }
.ab-news-head .ab-pause-title { margin-bottom: 2px; }
.ab-news-ver { font-size: 10px; letter-spacing: 0.2em; color: var(--ab-faint); margin-bottom: 10px; }
.ab-news-list { scrollbar-width: thin; scrollbar-color: rgba(207, 214, 230, 0.25) transparent; flex: 1 1 auto; min-height: 0; overflow-y: auto; text-align: left; padding-right: 6px; touch-action: pan-y; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.ab-news-rel { margin-bottom: 14px; }
.ab-news-relhead { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--ab-line); padding-bottom: 3px; margin-bottom: 6px; }
.ab-news-relhead .v { color: var(--ab-ember); font-weight: 700; letter-spacing: 0.22em; }
.ab-news-relhead .d { color: var(--ab-faint); font-size: 10px; letter-spacing: 0.1em; }
.ab-news-sum { color: var(--ab-dim); font-size: 10.5px; margin-bottom: 8px; }
.ab-news-entry { margin: 0 0 9px; padding-left: 8px; border-left: 1px solid rgba(207, 214, 230, 0.1); }
.ab-news-entry.unseen { border-left-color: var(--ab-ember); }
.ab-news-title { display: flex; gap: 8px; align-items: baseline; color: #ebe3d3; font-size: 11px; letter-spacing: 0.04em; }
.ab-news-title .n { flex: 1 1 auto; }
.ab-news-title .d { color: var(--ab-faint); font-size: 10px; white-space: nowrap; }
.ab-news-title .new { display: none; color: #0b0d12; background: var(--ab-ember); font-size: 9px; font-weight: 700; letter-spacing: 0.12em; padding: 0 4px; }
.ab-news-entry.unseen .ab-news-title .new { display: inline-block; }
.ab-news-notes { margin: 3px 0 0; padding: 0; list-style: none; color: var(--ab-dim); font-size: 10.5px; line-height: 1.45; }
.ab-news-notes li { position: relative; padding-left: 12px; }
.ab-news-notes li::before { content: '-'; position: absolute; left: 0; color: var(--ab-faint); }
.ab-news-foot { display: flex; margin-top: 8px; }
.ab-news-foot .ab-btn { justify-content: center; margin: 0; }
/* the title's WHAT'S NEW button and the badges that count the unread entries */
.ab-news-row { position: absolute; top: 14px; right: 16px; margin: 0; } /* a corner: the title's column stays as it was */
.ab-touch .ab-news-row { top: max(8px, env(safe-area-inset-top)); right: max(10px, env(safe-area-inset-right)); }
.ab-touch .ab-news-row .ab-btn { min-height: 32px; }
.ab-news-btn { gap: 8px; }
.ab-news-badge { display: none; color: #0b0d12; background: var(--ab-ember); font-size: 9px; font-weight: 700; letter-spacing: 0.12em; padding: 0 5px; }
.ab-news-badge.on { display: inline-block; animation: ab-blink 1.8s ease-in-out infinite; }
.ab-btn.has-new .v { color: var(--ab-ember); }

/* ---------- touch devices (src/ui/touch.js adds .ab-touch; desktop never gets it) ---------- */
.ab-root:not(.ab-touch) .tp-only { display: none !important; }
.ab-touch .kb-only { display: none !important; }
.ab-touch .ab-log, .ab-touch .ab-help { display: none; }
/* the interaction prompt is a tap target ("[E] Rest" → TAP › Rest at bonfire) */
.ab-touch .ab-prompt { bottom: 40px; z-index: 7; padding: 9px 16px; border-color: rgba(255, 138, 61, 0.55); }
.ab-touch .ab-prompt.on { pointer-events: auto; touch-action: none; }
.ab-touch .ab-prompt .ab-key { display: none; }
.ab-touch .ab-prompt::before { content: 'TAP \\203A  '; color: var(--ab-ember); letter-spacing: 0.14em; }
.ab-touch .ab-pause-panel { max-height: calc(100% - 16px); overflow-y: auto; touch-action: pan-y; overscroll-behavior: contain; }
.ab-touch .ab-btn { min-height: 38px; }
/* phones in landscape (~360-430 px tall): scale the panels down, keep the thumbs' corners free */
@media (max-height: 560px) {
  .ab-touch { font-size: 10px; }
  .ab-touch .ab-pf { left: 8px; top: 6px; font-size: 10px; }
  .ab-touch .ab-boss { top: 6px; font-size: 10px; }
  .ab-touch .ab-banner .band { height: 112px; }
  .ab-touch .ab-banner .sub { margin-top: 40px; font-size: 10px; }
  .ab-touch .ab-banner.k-area { top: 22%; }
  .ab-touch .ab-banner.k-area .sub { margin-top: 20px; }
  .ab-touch .ab-banner.k-victory { top: 24%; }
  .ab-touch .ab-stats { top: calc(24% + 44px); padding: 6px 12px 7px; }
  .ab-touch .ab-stats .row { line-height: 15px; font-size: 10px; }
  .ab-touch .ab-stats.has-head { gap: 16px; padding: 7px 14px 8px; }
  .ab-touch .ab-grade-big { font-size: 10px; }
  .ab-touch .ab-rec-head.g-c .ab-grade-big { font-size: 8.5px; }
  .ab-touch .ab-stats.has-head .ab-stats-body { column-gap: 16px; }
  .ab-touch .ab-stats.has-head .row { font-size: 9.5px; }
  .ab-touch[data-state='victory'] .ab-prompt { bottom: 10px; }
  .ab-touch .ab-mini { top: 22%; }
  .ab-touch .ab-title { padding-top: 0; }
  .ab-touch .ab-logo { font-size: clamp(8px, 1.45vw, 15px); }
  .ab-touch .ab-title-rule { margin-top: 8px; }
  /* the stage picker with each best (ADR-179): tighter buttons, so eight levels and the rush keep to two rows */
  .ab-touch .ab-stage { gap: 6px; margin-top: 10px; }
  .ab-touch .ab-stage .ab-btn { min-height: 0; margin: 0; font-size: 9.5px; letter-spacing: 0.1em; padding: 4px 8px; }
  .ab-touch .ab-stage .ab-stage-time, .ab-touch .ab-stage .ab-stage-best { margin-top: 1px; font-size: 8.5px; }
  .ab-touch .ab-title-sub { margin-top: 6px; font-size: 10px; }
  .ab-touch .ab-press { margin-top: 16px; }
  .ab-touch .ab-title-ctrl { margin-top: 10px; font-size: 9.5px; line-height: 17px; }
  .ab-touch .ab-legend.title { margin-top: 6px; font-size: 9.5px; }
  .ab-touch .ab-credit { bottom: 5px; font-size: 9px; }
  /* above the floating LAB toggle (bottom centre, 36 px) when the Lab is in the page */
  .ab-touch .ab-pause { align-items: flex-start; padding-top: 6px; }
  .ab-touch .ab-pause-panel { width: min(420px, 92vw); max-height: calc(100% - 54px); padding: 10px 16px 12px; }
  .ab-touch .ab-pause-title { font-size: 16px; margin-bottom: 6px; }
  .ab-touch .ab-btn { margin: 5px 0; padding: 0 10px; }
  .ab-touch .ab-sep { margin: 9px 0 8px; }
  .ab-touch .ab-ctrls { font-size: 10px; }
}
/* phones, either way up: the minimap is smaller and fainter still */
@media (max-height: 560px), (max-width: 560px) {
  .ab-touch .ab-map { right: 6px; top: 6px; opacity: 0.5; }
  .ab-touch .ab-map canvas { width: 40px; height: 40px; }
  .ab-touch .ab-map-line.fps { font-size: 8px; margin-top: 1px; }
}
/* a phone held upright (~360-430 px wide): the frame and the boss bar at the top, the prompt and
   the banners above the thumbs, the menus as wide as the screen */
@media (max-width: 560px) and (orientation: portrait) {
  .ab-touch { font-size: 10px; }
  .ab-touch .ab-pf { left: 6px; top: 6px; font-size: 10px; }
  .ab-touch .ab-boss { top: 78px; font-size: 10px; }
  .ab-touch .ab-boss-name { letter-spacing: 0.16em; }
  .ab-touch .ab-prompt { bottom: 47%; }
  .ab-touch .ab-banner .band { height: 112px; }
  .ab-touch .ab-banner .sub { margin-top: 40px; font-size: 10px; }
  .ab-touch .ab-banner.k-area { top: 24%; }
  .ab-touch .ab-banner.k-area .sub { margin-top: 20px; }
  .ab-touch .ab-banner.k-victory { top: 18%; }
  .ab-touch .ab-banner .sub { white-space: normal; padding: 0 14px; line-height: 1.5; }
  .ab-touch .ab-stats { top: calc(18% + 44px); padding: 6px 12px 7px; max-width: 92vw; }
  .ab-touch .ab-stats .row { line-height: 15px; font-size: 10px; }
  /* upright: the grade over the rows; the prompt below the panel (no fight on the record screen) */
  .ab-touch .ab-stats.has-head { flex-direction: column; gap: 8px; width: 92vw; top: calc(18% + 80px); }
  .ab-touch .ab-stats.has-head .ab-rec-rows { width: 100%; }
  .ab-touch .ab-stats.has-head .ab-stats-body { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 12px; }
  .ab-touch .ab-stats.has-head .row { font-size: 9.5px; gap: 6px; }
  .ab-touch[data-state='victory'] .ab-prompt { bottom: 14%; }
  .ab-touch .ab-mini { top: 24%; }
  /* a long flurry name (HUNDREDFOLD / THOUSANDFOLD FLASH) keeps to the width: shorter side rules */
  .ab-touch .ab-mini.long .txt { gap: 8px; }
  .ab-touch .ab-mini.long .txt::before, .ab-touch .ab-mini.long .txt::after { width: 22px; }
  .ab-touch .ab-logo { font-size: clamp(5px, 2.5vw, 12px); }
  .ab-touch .ab-title-sub { font-size: 10px; }
  .ab-touch .ab-title-ctrl { font-size: 9.5px; line-height: 17px; max-width: 94vw; }
  .ab-touch .ab-legend.title { font-size: 9.5px; max-width: 94vw; }
  .ab-touch .ab-credit { bottom: 5px; font-size: 9px; }
  /* the menu keeps to the upper part: the pad shows below it while PAD POSITION / PAD SIZE are stepped */
  .ab-touch .ab-pause { align-items: flex-start; padding-top: 50px; }
  .ab-touch .ab-pause-panel { width: 94vw; max-height: 50%; padding: 10px 14px 12px; }
  .ab-touch .ab-pause-title { font-size: 16px; margin-bottom: 6px; }
  .ab-touch .ab-btn { margin: 5px 0; padding: 0 10px; }
  .ab-touch .ab-ctrls { font-size: 10px; }
}
`;

export function injectHudStyle() {
  if (document.getElementById('ab-hud-style')) return;
  const style = document.createElement('style');
  style.id = 'ab-hud-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}
