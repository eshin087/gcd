// nav.mjs <url> [waitMs]  (env CDP_PORT, required: the film Edge): load the url in the headless Edge page (CDP_PORT / DEV_PORT) with Math.random
// seeded and the game's own requestAnimationFrame loop blocked from the very first script, so the
// page only moves on __tick and every load replays the same.
const PORT = process.env.CDP_PORT || (console.error('set CDP_PORT'), process.exit(1));
const url = process.argv[2];
const wait = Number(process.argv[3]) || 3500;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('chrome-extension')) || list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const src = `(() => {
  let s = 12345;
  Math.random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  window.__rafBlocked = 0;
  window.requestAnimationFrame = () => (window.__rafBlocked++, 0);
})();`;
await send('Page.enable');
const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
await send('Page.navigate', { url });
await new Promise((res) => setTimeout(res, wait));
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: r.result.identifier });
const ev = await send('Runtime.evaluate', { expression: 'JSON.stringify({game: !!window.__game, tick: typeof window.__tick, raf: window.__rafBlocked})', returnByValue: true });
console.log(ev.result?.result?.value);
ws.close();
