// Bundles the game into ONE self-contained HTML file (dist/index.html) that runs by double-click.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: 'es2022',
  legalComments: 'none',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/style.css', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');
html = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace('<link rel="stylesheet" href="./src/style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', () => `<script type="module">\n${js}\n</script>`);

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
console.log(`Built dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);

// the recorded music (ADR-117) is fetched next to the page: dist/assets/audio/. Opened
// from disk (file://) the game cannot fetch it and plays its synthesised score instead.
fs.rmSync('dist/assets', { recursive: true, force: true });
fs.cpSync('assets', 'dist/assets', { recursive: true, filter: (src) => !/\.md$/i.test(src) });
let bytes = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else bytes += fs.statSync(p).size; } };
walk('dist/assets');
console.log(`Copied dist/assets (${(bytes / 1048576).toFixed(1)} MB)`);
