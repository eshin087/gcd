// The new title layouts' styles (?menu=a|b|c; ui/titleMenu.js). Scoped under `.ab-title.gm`: the
// title as before (no parameter) never matches any of it. The colours and the faces are the title's
// and the HUD's own (ui/hudStyle.js: --ab-ink, --ab-dim, --ab-faint, --ab-ember, --ab-gold).

const CSS = `
.ab-title.gm {
  display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start;
  padding: max(16px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
  background:
    radial-gradient(ellipse 90% 80% at 50% 50%, rgba(3, 5, 9, 0.5), rgba(3, 5, 9, 0.86) 85%),
    linear-gradient(180deg, rgba(3, 5, 9, 0.55), rgba(3, 5, 9, 0.35) 40%, rgba(3, 5, 9, 0.8));
}
.gm .gm-top { flex: none; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.gm .gm-logo { font-size: 11px; line-height: 1.04; filter: drop-shadow(0 0 10px rgba(255, 120, 40, 0.22)); }
.gm .gm-corner { display: flex; gap: 8px; pointer-events: auto; }
.gm .gm-head { flex: none; margin: 0 0 12px; font-size: 10px; letter-spacing: 0.34em; color: var(--ab-dim); text-shadow: 0 1px 2px #000; }
.gm .gm-body { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; pointer-events: auto; scrollbar-width: thin; scrollbar-color: rgba(207, 214, 230, 0.2) transparent; touch-action: pan-y; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
/* the body's content sits in the middle of the free height (and scrolls from its top when too tall) */
.gm .gm-body > :first-child { margin-top: auto; }
.gm .gm-body > :last-child { margin-bottom: auto; }
.gm .gm-foot { flex: none; text-align: center; padding-top: 8px; }
.gm .gm-press { margin: 0; font-size: 11px; }
.gm .ab-credit.gm-credit { position: static; margin-top: 4px; font-size: 9px; }

/* every entry: a world, the rush, WHAT'S NEW, CONTROLS */
.gm .gm-e {
  margin: 0; width: auto; min-height: 36px; padding: 6px 12px; gap: 10px;
  justify-content: flex-start; font-size: 11.5px; letter-spacing: 0.14em; color: var(--ab-dim);
  background: rgba(6, 9, 14, 0.5); border-color: rgba(207, 214, 230, 0.14); text-align: left; white-space: nowrap;
}
.gm-b .gm-card, .gm-c .gm-node { white-space: normal; }
.gm .gm-e .ab-news-badge { font-size: 8.5px; letter-spacing: 0.08em; }
.gm .gm-e .gm-name { color: #c4cbda; }
.gm .gm-e.on .gm-name { color: #f2e7d2; text-shadow: 0 0 8px rgba(255, 138, 61, 0.4); }
.gm .gm-e.sel { border-color: rgba(255, 138, 61, 0.75); background: rgba(255, 138, 61, 0.09); color: #e3e7ef; }
.gm .gm-e.sel .gm-name { color: #fff; }
.gm .gm-e.pad-focus { border-color: var(--ab-ember); background: rgba(255, 138, 61, 0.14); box-shadow: 0 0 0 1px rgba(255, 138, 61, 0.35); }
.gm .gm-n { color: var(--ab-faint); font-variant-numeric: tabular-nums; letter-spacing: 0.06em; }
.gm .gm-g { font-weight: 800; letter-spacing: 0.04em; }
.gm .gm-here { color: var(--ab-ember); font-size: 9px; }
.gm .gm-small { min-height: 30px; padding: 4px 10px; font-size: 10px; }
.gm .gm-sub { color: var(--ab-faint); font-size: 10px; letter-spacing: 0.08em; }
.gm .gm-rush .gm-name { color: #f2e7d2; }
.gm .gr-s { color: #f3dc94; text-shadow: 0 0 6px rgba(216, 184, 106, 0.5); }
.gm .gr-a { color: var(--ab-ember); }
.gm .gr-b { color: #cfd6e6; }
.gm .gr-c { color: var(--ab-dim); }

/* the small fires: the title logo's face (it has the box strokes) */
.gm .gm-fire { margin: 0; font-family: 'Cascadia Mono', Consolas, Menlo, 'DejaVu Sans Mono', 'Liberation Mono', monospace; font-size: 11px; line-height: 1.05; letter-spacing: 0; white-space: pre; color: #5b4a3c; }
.gm .gm-fire.lit { color: #ff9a4a; text-shadow: 0 0 8px rgba(255, 120, 40, 0.55); }
.gm .gm-fire.lit .f0 { color: #ffd9a0; }
.gm .gm-fire.lit .f1 { color: #ffb066; }
.gm .gm-fire.lit .f3 { color: #8a5a36; text-shadow: none; }
.gm .gm-e.sel .gm-fire:not(.lit) { color: #8a6d55; }

/* the detail of the world in focus */
.gm .gm-detail { pointer-events: auto; }
.gm .gm-dt { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.gm .gm-dn { color: var(--ab-faint); font-variant-numeric: tabular-nums; }
.gm .gm-dname { font-size: 15px; font-weight: 700; letter-spacing: 0.2em; color: #f2e7d2; }
.gm .gm-dhere { font-size: 9px; letter-spacing: 0.24em; color: var(--ab-ember); }
.gm .gm-keeper { margin-top: 8px; font-size: 11.5px; letter-spacing: 0.06em; }
.gm .gm-kk { color: var(--ab-faint); letter-spacing: 0.2em; font-size: 9.5px; }
.gm .gm-kn { color: #ebe3d3; font-weight: 700; }
.gm .gm-ke { color: var(--ab-dim); }
.gm .gm-dsub2 { margin-top: 6px; color: var(--ab-dim); font-size: 11px; font-style: italic; letter-spacing: 0.02em; }
.gm .gm-rec { margin-top: 10px; font-size: 11px; color: var(--ab-dim); font-variant-numeric: tabular-nums; }
.gm .gm-rk { color: var(--ab-faint); letter-spacing: 0.2em; font-size: 9.5px; }
.gm .gm-rg { font-weight: 800; }
.gm .gm-rm { color: var(--ab-gold); }
.gm .gm-ru, .gm .gm-rc { color: var(--ab-faint); }
.gm .gm-act { margin: 14px 0 0; width: auto; display: inline-flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 40px; padding: 7px 16px; color: #f2e7d2; border-color: rgba(255, 138, 61, 0.55); background: rgba(255, 138, 61, 0.07); letter-spacing: 0.22em; }
.gm .gm-actsub { font-size: 9px; letter-spacing: 0.1em; color: var(--ab-dim); }

/* CONTROLS: the old title's lists, in full, over the menu */
.gm .gm-drawer { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(2, 3, 6, 0.66); pointer-events: auto; z-index: 3; }
.gm .gm-drawer.on { display: flex; }
.gm .gm-dpanel { width: min(560px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow-y: auto; padding: 14px 18px; background: rgba(6, 9, 14, 0.92); touch-action: pan-y; overscroll-behavior: contain; }
.gm .gm-dhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 10px; letter-spacing: 0.24em; color: var(--ab-dim); }
.gm .gm-close { width: auto; margin: 0; min-height: 30px; padding: 4px 10px; font-size: 10px; }
.gm .gm-dsub { margin: 12px 0 4px; font-size: 10px; letter-spacing: 0.2em; color: var(--ab-dim); }
.gm .gm-dpanel .ab-legend { justify-content: flex-start; }

/* ---------- a: the world list ---------- */
.gm-a .gm-head { margin-left: 2px; }
.gm-a .gm-col { min-width: 0; }
.gm-a .gm-a-wrap { display: grid; grid-template-columns: minmax(300px, 400px) minmax(300px, 500px); gap: 18px 44px; justify-content: center; align-items: start; }
.gm-a .gm-list { display: flex; flex-direction: column; gap: 5px; }
.gm-a .gm-list .gm-world { display: flex; }
.gm-a .gm-world .gm-name { flex: 1 1 auto; }
.gm-a .gm-world .gm-g { width: 1.4ch; text-align: right; }
.gm-a .gm-world .gm-here { width: 1ch; }
.gm-a .gm-xlist { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
.gm-a .gm-xrow { display: flex; gap: 5px; }
.gm-a .gm-xrow .gm-e { flex: 1 1 0; justify-content: center; }
.gm-a .gm-rush { justify-content: space-between; }
.gm-a .gm-detail { position: sticky; top: 0; padding: 18px 22px 20px; border: 1px solid var(--ab-line); background: rgba(6, 9, 14, 0.7); min-height: 280px; }
.gm-a .gm-fire.big { font-size: 15px; margin-bottom: 12px; }

/* ---------- b: the campfire grid ---------- */
.gm-b .gm-head { text-align: center; }
.gm-b .gm-top { position: relative; }
.gm-b .gm-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 230px)); gap: 10px; justify-content: center; }
.gm-b .gm-card { flex-direction: column; align-items: center; justify-content: flex-start; padding: 10px 10px 9px; gap: 6px; text-align: center; min-height: 150px; }
.gm-b .gm-card .gm-fire { font-size: 12px; }
.gm-b .gm-ctext { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 100%; }
.gm-b .gm-chead { display: flex; justify-content: space-between; width: 100%; }
.gm-b .gm-card .gm-name { font-size: 11px; letter-spacing: 0.12em; line-height: 1.35; }
.gm-b .gm-card .gm-boss { font-size: 10px; letter-spacing: 0.08em; color: var(--ab-dim); }
.gm-b .gm-card .gm-t { font-size: 9.5px; color: var(--ab-faint); font-variant-numeric: tabular-nums; min-height: 1.2em; }
.gm-b .gm-strip { width: min(940px, 100%); margin: 12px auto 0; padding: 10px 16px; border: 1px solid var(--ab-line); background: rgba(6, 9, 14, 0.7); display: grid; grid-template-columns: 1fr auto; column-gap: 20px; align-items: center; }
.gm-b .gm-strip > * { grid-column: 1; }
.gm-b .gm-strip .gm-act { grid-column: 2; grid-row: 1 / span 4; margin: 0; }
.gm-b .gm-strip .gm-keeper { margin-top: 4px; }
.gm-b .gm-strip .gm-dsub2 { margin-top: 3px; }
.gm-b .gm-strip .gm-rec { margin-top: 4px; }
.gm-b .gm-xlist { width: min(940px, 100%); margin: 10px auto 0; }
.gm-b .gm-xlist .gm-rush { width: 100%; justify-content: center; gap: 18px; min-height: 40px; }

/* ---------- c: the sword's path ---------- */
.gm-c .gm-head { text-align: center; }
.gm-c .gm-path { display: flex; justify-content: center; margin: 4px auto 0; max-width: 1240px; }
.gm-c .gm-node { flex: 1 1 0; min-width: 0; max-width: 160px; flex-direction: column; align-items: center; justify-content: flex-start; gap: 3px; padding: 6px 4px 8px; border-color: transparent; background: transparent; text-align: center; }
.gm-c .gm-node.sel { background: rgba(255, 138, 61, 0.07); border-color: rgba(255, 138, 61, 0.45); }
.gm-c .gm-node .gm-fire { font-size: 10px; }
.gm-c .gm-mark { position: relative; display: block; width: 100%; text-align: center; color: var(--ab-faint); font-size: 13px; line-height: 18px; }
.gm-c .gm-mark::before, .gm-c .gm-mark::after { content: ''; position: absolute; top: 50%; border-top: 1px solid rgba(207, 214, 230, 0.22); }
.gm-c .gm-mark::before { left: -5px; right: calc(50% + 10px); }
.gm-c .gm-mark::after { left: calc(50% + 10px); right: -5px; }
.gm-c .gm-node:first-child .gm-mark::before, .gm-c .gm-node:last-child .gm-mark::after { display: none; }
.gm-c .gm-node.on .gm-mark { color: var(--ab-ember); text-shadow: 0 0 8px rgba(255, 138, 61, 0.6); }
.gm-c .gm-node.sel .gm-mark { color: #f2e7d2; }
.gm-c .gm-ntext { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.gm-c .gm-node .gm-name { font-size: 10.5px; letter-spacing: 0.1em; line-height: 1.35; }
.gm-c .gm-open { width: min(620px, 100%); margin: 12px auto 0; padding: 14px 20px 16px; border: 1px solid var(--ab-line); background: rgba(6, 9, 14, 0.7); }
.gm-c .gm-xlist { width: min(620px, 100%); margin: 10px auto 0; }
.gm-c .gm-xlist .gm-rush { width: 100%; justify-content: center; gap: 18px; }

/* ---------- touch: every target a thumb's size ---------- */
.ab-touch .gm .gm-e { min-height: 44px; }
.ab-touch .gm .gm-small, .ab-touch .gm .gm-close { min-height: 40px; }
.ab-touch .gm-c .gm-node { min-height: 44px; }

/* ---------- a phone on its side (~390 px tall) ---------- */
@media (min-width: 1700px) and (min-height: 900px) {
  .gm .gm-logo { font-size: 14px; }
  .gm .gm-e { font-size: 13px; min-height: 42px; }
  .gm .gm-dname { font-size: 18px; }
  .gm .gm-keeper, .gm .gm-dsub2, .gm .gm-rec { font-size: 13px; }
  .gm-a .gm-a-wrap { grid-template-columns: minmax(340px, 460px) minmax(340px, 600px); }
  .gm-b .gm-grid { grid-template-columns: repeat(4, minmax(0, 270px)); }
  .gm-b .gm-card .gm-fire { font-size: 14px; }
  .gm-b .gm-card .gm-name { font-size: 12.5px; }
  .gm-b .gm-strip, .gm-b .gm-xlist { width: min(1110px, 100%); }
  .gm-c .gm-node .gm-fire { font-size: 12px; }
  .gm-c .gm-node .gm-name { font-size: 12px; }
}
@media (max-height: 500px) {
  .ab-title.gm { padding-top: max(8px, env(safe-area-inset-top)); padding-bottom: max(4px, env(safe-area-inset-bottom)); }
  .gm .gm-logo { font-size: 6.5px; }
  .gm .gm-head { margin: 0 0 6px; font-size: 9px; }
  .gm .gm-e { font-size: 10px; letter-spacing: 0.1em; padding: 4px 9px; }
  .gm .gm-foot { padding-top: 4px; }
  .gm .gm-press { font-size: 10px; }
  .gm .ab-credit.gm-credit { margin-top: 1px; font-size: 8px; }
  .gm .gm-dname { font-size: 12px; }
  .gm .gm-keeper, .gm .gm-dsub2, .gm .gm-rec { font-size: 10px; margin-top: 4px; }
  .gm .gm-act { margin-top: 8px; min-height: 40px; padding: 5px 12px; }
  /* a: the list in two columns beside the detail */
  .gm-a .gm-a-wrap { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 10px 14px; }
  .gm-a .gm-world { letter-spacing: 0.04em; gap: 7px; }
  .gm-a .gm-list { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .gm-a .gm-list .gm-world { min-width: 0; }
  .gm-a .gm-world .gm-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gm-a .gm-xlist { grid-column: 1 / -1; flex-direction: row; margin-top: 2px; gap: 4px; }
  .gm-a .gm-xlist .gm-rush { flex: 1.3 1 0; }
  .gm-a .gm-xlist .gm-rush .gm-sub { display: none; }
  .gm-a .gm-xrow { flex: 2 1 0; gap: 4px; }
  .gm-a .gm-detail { min-height: 0; padding: 10px 14px 12px; }
  .gm-a .gm-fire.big { font-size: 9px; margin-bottom: 6px; }
  /* b: cards on their side, the fire beside the name */
  .gm-b .gm-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
  .gm-b .gm-card { flex-direction: row; align-items: center; min-height: 58px; padding: 5px 7px; gap: 7px; text-align: left; }
  .gm-b .gm-card .gm-fire { font-size: 7px; flex: none; }
  .gm-b .gm-ctext { align-items: flex-start; gap: 1px; min-width: 0; }
  .gm-b .gm-card .gm-name { font-size: 9px; letter-spacing: 0.06em; line-height: 1.25; }
  .gm-b .gm-card .gm-boss { font-size: 9px; }
  .gm-b .gm-card .gm-t { display: none; }
  .gm-b .gm-strip { margin-top: 6px; padding: 5px 10px; }
  .gm-b .gm-strip .gm-dsub2 { display: none; }
  .gm-b .gm-strip .gm-act { margin: 0; }
  .gm-b .gm-xlist { margin-top: 5px; }
  /* c: a shorter path */
  .gm-c .gm-node { padding: 3px 2px 5px; gap: 1px; }
  .gm-c .gm-node .gm-fire { font-size: 6.5px; }
  .gm-c .gm-node .gm-name { font-size: 8.5px; letter-spacing: 0.04em; }
  .gm-c .gm-open { margin-top: 6px; padding: 7px 14px 9px; display: grid; grid-template-columns: 1fr auto; column-gap: 16px; align-items: center; }
  .gm-c .gm-open > * { grid-column: 1; }
  .gm-c .gm-open .gm-act { grid-column: 2; grid-row: 1 / span 4; margin: 0; }
  .gm-c .gm-open .gm-dsub2 { display: none; }
  .gm-c .gm-xlist { margin-top: 5px; }
}

/* ---------- a phone held upright (~390 px wide) ---------- */
@media (max-width: 560px) and (orientation: portrait) {
  .ab-title.gm { padding-left: max(14px, env(safe-area-inset-left)); padding-right: max(14px, env(safe-area-inset-right)); padding-top: max(14px, env(safe-area-inset-top)); }
  .gm .gm-logo { font-size: 8px; }
  .gm .gm-head { margin: 0 0 8px; font-size: 9px; letter-spacing: 0.26em; }
  .gm .gm-e { font-size: 10.5px; letter-spacing: 0.1em; padding: 5px 10px; }
  .gm .gm-dname { font-size: 13px; letter-spacing: 0.14em; }
  .gm .gm-keeper, .gm .gm-dsub2, .gm .gm-rec { font-size: 10.5px; }
  /* a: the list on top, the detail under it */
  .gm-a .gm-a-wrap { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .gm-a .gm-list { gap: 4px; }
  .gm-a .gm-xlist { flex-direction: row; gap: 4px; margin-top: 4px; }
  .gm-a .gm-xlist .gm-rush { flex: 1 1 0; justify-content: center; }
  .gm-a .gm-xlist .gm-rush .gm-sub, .gm-a .gm-xlist .gm-rush .gm-g { display: none; }
  .gm-a .gm-xrow { flex: 2 1 0; gap: 4px; }
  .gm-a .gm-detail { position: static; min-height: 0; padding: 10px 14px 12px; }
  .gm-a .gm-fire.big { display: none; }
  .gm-a .gm-act { margin-top: 10px; }
  /* b: two columns of cards on their side */
  .gm-b .gm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .gm-b .gm-card { flex-direction: row; align-items: center; min-height: 64px; padding: 6px 8px; gap: 8px; text-align: left; }
  .gm-b .gm-card .gm-fire { font-size: 8px; flex: none; }
  .gm-b .gm-ctext { align-items: flex-start; gap: 1px; min-width: 0; }
  .gm-b .gm-card .gm-name { font-size: 9.5px; letter-spacing: 0.06em; line-height: 1.25; }
  .gm-b .gm-card .gm-boss { font-size: 9.5px; }
  .gm-b .gm-card .gm-t { display: none; }
  .gm-b .gm-strip { grid-template-columns: minmax(0, 1fr); padding: 8px 12px 10px; margin-top: 8px; }
  .gm-b .gm-strip .gm-act { grid-column: 1; grid-row: auto; margin-top: 8px; }
  .gm-b .gm-xlist { margin-top: 6px; }
  .gm .gm-corner .gm-e { padding: 4px 8px; font-size: 9.5px; letter-spacing: 0.08em; }
  /* c: the path runs down the left, each fire a row */
  .gm-c .gm-path { flex-direction: column; align-items: stretch; margin: 0; }
  .gm-c .gm-node { max-width: none; flex: none; flex-direction: row; align-items: center; justify-content: flex-start; gap: 10px; padding: 0 10px 0 4px; min-height: 44px; text-align: left; }
  .gm-c .gm-node .gm-fire { display: none; }
  .gm-c .gm-mark { width: 22px; flex: none; align-self: stretch; display: flex; align-items: center; justify-content: center; line-height: 1; }
  .gm-c .gm-mark::before, .gm-c .gm-mark::after { top: auto; border-top: 0; border-left: 1px solid rgba(207, 214, 230, 0.22); left: 50%; right: auto; }
  .gm-c .gm-mark::before { top: -6px; bottom: calc(50% + 9px); }
  .gm-c .gm-mark::after { top: calc(50% + 9px); bottom: -6px; }
  .gm-c .gm-ntext { flex-direction: row; align-items: baseline; gap: 10px; flex: 1 1 auto; min-width: 0; }
  .gm-c .gm-node .gm-name { flex: 1 1 auto; font-size: 10.5px; letter-spacing: 0.1em; }
  .gm-c .gm-open { margin-top: 8px; padding: 10px 14px 12px; }
  .gm-c .gm-open .gm-act { margin-top: 10px; }
  .gm-c .gm-xlist { margin-top: 6px; }
}
`;

export function injectTitleMenuStyle() {
  if (typeof document === 'undefined' || document.getElementById?.('gm-style')) return;
  const style = document.createElement('style');
  style.id = 'gm-style';
  style.textContent = CSS;
  document.head?.appendChild(style);
}
