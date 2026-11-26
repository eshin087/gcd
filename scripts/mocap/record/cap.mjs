// cap.mjs (scripts/mocap/record; see capall.sh and ../duelist/README.md "Setup"): record a playing YouTube video frame by frame (requestVideoFrameCallback) through CDP.
//   CDP_PORT=9397 node cap.mjs <url> <outDir> [t0=0] [t1=end] [width=1280] [rate=1]
// Files: <outDir>/t<seconds, 8 wide>.jpg, named by the frame's media time. Ads are skipped (never saved).
// Prints the media-time gaps over 0.05 s at the end (to refill with grab.mjs).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const PORT = process.env.CDP_PORT || 9397;
const [vurl, dir, t0s = '0', t1s = '1e9', ws_ = '1280', rate = '1'] = process.argv.slice(2);
const out = path.join(here, dir);
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = list.find((t) => t.type === 'page');
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
await send('Page.enable');
await send('Page.navigate', { url: vurl });
await sleep(7000);
// wait out the ads
for (let i = 0; i < 25; i++) {
  const r = await ev(`(()=>{const s=document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern'); if(s) s.click(); const v=document.querySelector('video'); return (document.querySelector('.ad-showing')?'ad':'ok')+' '+(v?v.duration:0)})()`);
  if (r.startsWith('ok')) break;
  await sleep(2000);
}
if ((await ev(`document.querySelector('.ad-showing') ? 'ad' : 'ok'`)) === 'ad') { console.log('ad at start: giving up this try'); ws.close(); process.exit(3); }
await ev(`(()=>{const p=document.getElementById('movie_player'); p.setPlaybackQualityRange('hd1080','hd1080'); const v=document.querySelector('video'); v.pause(); v.currentTime=${+t0s}; return 1})()`);
await sleep(4000);
console.log(await ev(`(()=>{const v=document.querySelector('video'); const p=document.getElementById('movie_player'); return JSON.stringify({dur:v.duration,w:v.videoWidth,h:v.videoHeight,q:p.getPlaybackQuality(),t:v.currentTime})})()`));
await ev(`(()=>{
  const v = document.querySelector('video');
  const W = ${+ws_}, H = Math.round(W * v.videoHeight / v.videoWidth);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const C = window.__cap = { buf: [], on: true, last: -1, n: 0, ads: 0, held: false, t1: ${+t1s} };
  let tok = 0;
  const cb = (now, meta) => {
    if (!C.on) return;
    C.seen = performance.now();
    const ad = !!document.querySelector('.ad-showing');
    if (ad) { C.ads++; const s = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern'); if (s) s.click(); }
    else if (meta.mediaTime !== C.last) {
      C.last = meta.mediaTime;
      if (meta.mediaTime >= C.t1) { C.on = false; v.pause(); return; }
      g.drawImage(v, 0, 0, W, H);
      C.buf.push([meta.mediaTime, c.toDataURL('image/jpeg', 0.8)]); C.n++;
      if (C.buf.length > 400 && !C.held) { C.held = true; v.pause(); }
    }
    v.requestVideoFrameCallback(cb);
  };
  v.requestVideoFrameCallback(cb);
  v.playbackRate = ${+rate};
  v.play();
  // a paused video delivers no frame callbacks: this timer resumes it once the buffer drained
  C.seen = performance.now();
  setInterval(() => {
    if (!C.on) return;
    const ad = !!document.querySelector('.ad-showing');
    if (ad) { const s = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern'); if (s) s.click(); }
    if (C.held) { if (C.buf.length < 50) { C.held = false; C.seen = performance.now(); v.play(); v.requestVideoFrameCallback(cb); } return; }
    // no frame callback for a second (an ad ended, the player paused itself): start the chain again
    if (performance.now() - C.seen > 1000) { C.seen = performance.now(); if (v.paused) v.play().catch(() => {}); v.requestVideoFrameCallback(cb); }
  }, 250);
  return 1;
})()`);
const times = [];
let idle = 0, saved = 0;
const start = Date.now();
for (;;) {
  const r = JSON.parse(await ev(`(()=>{const C=window.__cap; const v=document.querySelector('video'); return JSON.stringify({f:C.buf.splice(0,12), on:C.on, ended:v.ended, left:C.buf.length, t:v.currentTime, ads:C.ads})})()`));
  for (const [t, d] of r.f) {
    fs.writeFileSync(path.join(out, 't' + t.toFixed(3).padStart(8, '0') + '.jpg'), Buffer.from(d.split(',')[1], 'base64'));
    times.push(t); saved++;
  }
  if (saved % 1800 < r.f.length) console.log(`saved ${saved} at ${r.t.toFixed(1)} s (${((Date.now() - start) / 1000).toFixed(0)} s real, ads ${r.ads})`);
  if (!r.f.length) { idle++; await sleep(150); } else idle = 0;
  if (idle === 200 || idle === 1000 || idle === 2500) console.log('waiting (ad or stall) at', r.t, 'ads', r.ads);
  if ((!r.on || r.ended) && r.left === 0 && !r.f.length) break;
  if (idle > 300) { console.log('stalled at', r.t); break; }
}
times.sort((a, b) => a - b);
const gaps = [];
for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > 0.05) gaps.push([times[i - 1].toFixed(3), times[i].toFixed(3)]);
console.log(`CAP DONE ${saved} frames, ${gaps.length} gaps`, JSON.stringify(gaps.slice(0, 200)));
fs.writeFileSync(path.join(here, dir + '-gaps.json'), JSON.stringify(gaps));
ws.close();
