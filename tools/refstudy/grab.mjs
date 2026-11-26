// grab.mjs: drive a headless Edge (CDP_PORT, default 9391) showing the reference video; save frame grabs.
// Output dirs resolve against OUT (default: ./out next to this file; keep it OUTSIDE the repo, never commit frames).
//   node grab.mjs nav <url>
//   node grab.mjs info
//   node grab.mjs play                                  (playVideo, wait for readyState>=2 and no ad)
//   node grab.mjs hd                                    (ask for 1080p)
//   node grab.mjs eval "<js>"
//   node grab.mjs shot <file.jpg>                        (viewport screenshot)
//   node grab.mjs grab <dir> <t0> <t1> <step> <width> [quality] [cx cy cw ch]   (crop as 0-1 fractions of the frame)
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
const here = path.resolve(process.env.OUT || path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'out'));
fs.mkdirSync(here, { recursive: true });
const PORT = process.env.CDP_PORT || 9391;
const [cmd, ...a] = process.argv.slice(2);
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = list.find((t) => t.type === 'page' && t.url.includes('youtube.com/watch')) || list.find((t) => t.type === 'page');
if (!page) { console.log('no page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 60000 });
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails.exception?.description || res.result.exceptionDetails).slice(0, 800));
  return res.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (cmd === 'nav') {
  await send('Page.enable');
  await send('Page.navigate', { url: a[0] });
  await sleep(6000);
  console.log(await ev('JSON.stringify({title: document.title, url: location.href, video: !!document.querySelector("video")})'));
} else if (cmd === 'info') {
  console.log(await ev(`(() => { const v = document.querySelector('video'); const p = document.getElementById('movie_player'); return JSON.stringify({ title: document.title, t: v?.currentTime, dur: v?.duration, w: v?.videoWidth, h: v?.videoHeight, paused: v?.paused, rs: v?.readyState, ad: !!document.querySelector('.ad-showing'), q: p?.getPlaybackQuality?.(), avail: p?.getAvailableQualityLevels?.(), body: document.body.innerText.slice(0, 300) }); })()`));
} else if (cmd === 'play') {
  for (let i = 0; i < 240; i++) {
    await ev(`(() => { const p = document.getElementById('movie_player'); p?.playVideo?.(); const s = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern'); s?.click(); return 1; })()`);
    const st = JSON.parse(await ev(`JSON.stringify({ rs: document.querySelector('video')?.readyState, ad: !!document.querySelector('.ad-showing') })`));
    if (st.rs >= 2 && !st.ad) { console.log('ready'); break; }
    await sleep(1000);
  }
} else if (cmd === 'hd') {
  console.log(await ev(`(() => { const p = document.getElementById('movie_player'); p.setPlaybackQualityRange('hd1080'); p.setPlaybackQuality('hd1080'); return p.getPlaybackQuality(); })()`));
} else if (cmd === 'eval') {
  console.log(await ev(a[0]));
} else if (cmd === 'shot') {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  fs.writeFileSync(path.resolve(here, a[0]), Buffer.from(r.result.data, 'base64'));
  console.log('saved', a[0]);
} else if (cmd === 'grab') {
  const [dir, t0s, t1s, steps, ws_, qs, cx = '0', cy = '0', cw = '1', ch = '1'] = a;
  const t0 = +t0s, t1 = +t1s, step = +steps, W = +ws_, q = +(qs || 0.85);
  const out = path.join(here, dir);
  fs.mkdirSync(out, { recursive: true });
  await ev(`(() => {
    const v = document.querySelector('video'); v.pause();
    window.__one = async (t, W, q, cx, cy, cw, ch) => {
      await new Promise((r) => { const d = () => { v.removeEventListener('seeked', d); r(); }; v.addEventListener('seeked', d); v.currentTime = t; setTimeout(r, 4000); });
      await new Promise((r) => { let n = 0; const go = () => (v.readyState >= 2 || n++ > 60 ? r() : setTimeout(go, 25)); go(); });
      await new Promise((r) => setTimeout(r, 40));
      const sx = cx * v.videoWidth, sy = cy * v.videoHeight, sw = cw * v.videoWidth, sh = ch * v.videoHeight;
      const c = window.__cv || (window.__cv = document.createElement('canvas'));
      c.width = W; c.height = Math.round(W * sh / sw);
      c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    };
    return 'ok';
  })()`);
  const n = Math.floor((t1 - t0) / step + 1e-6) + 1;
  const start = Date.now();
  for (let i = 0; i < n; i++) {
    const t = +(t0 + i * step).toFixed(4);
    const d = await ev(`window.__one(${t}, ${W}, ${q}, ${cx}, ${cy}, ${cw}, ${ch})`);
    fs.writeFileSync(path.join(out, 't' + t.toFixed(3).padStart(8, '0') + '.jpg'), Buffer.from(d.split(',')[1], 'base64'));
  }
  console.log(`grabbed ${n} into ${dir} in ${((Date.now() - start) / 1000).toFixed(1)} s`);
}
ws.close();
