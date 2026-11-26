// The film server: serves a checkout (like scripts/serve.mjs) plus
//   GET  /__scratch/*                    files from this folder (take.js, the in-page film helper)
//   POST /__shot?name=x.png|jpg          writes the body into <OUT>/shots/
//   POST /__film/start?name=x&fps=60     opens ffmpeg: JPEG frames in, <OUT>/out/<x>.mp4 (libx264, yuv420p, crf 24)
//   POST /__film/frame                   one JPEG frame (in order)
//   POST /__film/end                     closes it; replies when the MP4 is written
//   usage: PORT=5241 OUT=<dir outside the repo> node serve.mjs <checkout>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawn } from 'node:child_process';

const scratch = path.dirname(url.fileURLToPath(import.meta.url)); // served as /__scratch/
const outDir = path.resolve(process.env.OUT || path.join(scratch, '.out')); // shots/ and out/ go here
const root = path.resolve(process.argv[2] || '.');
const port = Number(process.env.PORT) || 5241;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.map': 'application/json' };
fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'out'), { recursive: true });

let film = null; // { proc, name, frames, done: Promise }
const body = (req) => new Promise((res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => res(Buffer.concat(chunks)));
});
const reply = (res, code, text) => {
  res.writeHead(code, { 'Content-Type': 'text/plain' });
  res.end(text);
};

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && u.pathname === '/__shot') {
      const name = path.basename(u.searchParams.get('name') || 'shot.png');
      fs.writeFileSync(path.join(outDir, 'shots', name), await body(req));
      return reply(res, 200, 'ok ' + name);
    }
    if (req.method === 'POST' && u.pathname === '/__film/start') {
      if (film) film.proc.stdin.end();
      const name = path.basename(u.searchParams.get('name') || 'film').replace(/[^\w.-]/g, '_');
      const fps = Number(u.searchParams.get('fps')) || 60;
      const file = path.join(outDir, 'out', name + '.mp4');
      const proc = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'medium', '-movflags', '+faststart', file], { stdio: ['pipe', 'ignore', 'pipe'] });
      let err = '';
      proc.stderr.on('data', (d) => (err += d));
      const done = new Promise((r) => proc.on('close', (code) => r({ code, err })));
      film = { proc, name, file, frames: 0, done };
      await body(req);
      return reply(res, 200, 'started ' + file);
    }
    if (req.method === 'POST' && u.pathname === '/__film/frame') {
      const b = await body(req);
      if (!film) return reply(res, 409, 'no film');
      film.frames++;
      if (!film.proc.stdin.write(b)) await new Promise((r) => film.proc.stdin.once('drain', r));
      return reply(res, 200, String(film.frames));
    }
    if (req.method === 'POST' && u.pathname === '/__film/end') {
      await body(req);
      if (!film) return reply(res, 409, 'no film');
      const f = film;
      film = null;
      f.proc.stdin.end();
      const r = await f.done;
      return reply(res, r.code === 0 ? 200 : 500, JSON.stringify({ file: f.file, frames: f.frames, code: r.code, err: r.err.slice(0, 500) }));
    }
    let p = decodeURIComponent(u.pathname);
    let base = root;
    if (p.startsWith('/__scratch/')) {
      base = scratch;
      p = p.slice('/__scratch'.length);
    }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(base, p));
    if (!file.startsWith(base)) return reply(res, 403, '');
    fs.readFile(file, (err, data) => {
      if (err) return reply(res, 404, 'not found');
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  })
  .listen(port, () => console.log(`film server on http://localhost:${port} -> ${root}`));
