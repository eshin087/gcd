// run.mjs <name> <query> [streak]: load the page frozen with `query`, run take() in it, print the result.
// env: CDP_PORT (the film Edge), DEV_PORT (serve.mjs), TAKE (the take module, default take.js next to serve.mjs).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const [name, query, streak = '6'] = process.argv.slice(2);
const CDP = process.env.CDP_PORT, DEV = process.env.DEV_PORT;
if (!CDP || !DEV) { console.error('set CDP_PORT and DEV_PORT'); process.exit(1); }
const TAKE = process.env.TAKE || 'take.js';
const out = execFileSync('node', [path.join(here, 'nav.mjs'), `http://localhost:${DEV}/?${query}`, '9000'], { env: { ...process.env, CDP_PORT: CDP, DEV_PORT: DEV } }).toString();
console.log('nav', out.trim());
const list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
const page = list.find((t) => t.type === 'page' && t.url.includes(`:${DEV}`));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const expr = `(async () => { for (let i = 0; i < 200 && !(window.__game?.player && window.__tick); i++) await new Promise((r) => setTimeout(r, 100)); const m = await import('/__scratch/${TAKE}?v=' + Date.now()); return m.take(${JSON.stringify(name)}, { streak: ${Number(streak)} }); })()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 });
console.log(r.result?.result?.value ?? JSON.stringify(r.result?.exceptionDetails ?? r).slice(0, 1500));
ws.close();
