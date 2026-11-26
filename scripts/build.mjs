// Bundles the game into ONE self-contained HTML file (dist/index.html) that runs by double-click.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
process.chdir(root);

// The remade hero's clip sets (src/entities/hero2/clips/*.js, horse/clips/*.js: generated data, megabytes
// of it, used only behind ?hero=new) are not inlined: each is replaced by a stub naming its JSON file in
// dist/assets/hero2/, written below, which the set's loader fetches when the switch is on.
const CLIP_DIRS = ['src/entities/hero2/clips', 'src/entities/hero2/horse/clips'].map((d) => path.resolve(root, d));
const isClipSet = (p) => CLIP_DIRS.includes(path.resolve(path.dirname(p))) && path.basename(p) !== 'index.js' && p.endsWith('.js');
const clipSets = [];
const clipsOut = {
  name: 'hero2-clips-out',
  setup(b) {
    b.onLoad({ filter: /[\\/]entities[\\/]hero2[\\/](horse[\\/])?clips[\\/][^\\/]+\.js$/ }, (args) => {
      if (!isClipSet(args.path)) return undefined;
      const id = path.basename(args.path, '.js');
      clipSets.push(args.path);
      return { contents: `export default { remote: 'assets/hero2/${id}.json' };`, loader: 'js' };
    });
  },
};

const result = await build({
  entryPoints: ['src/main.js'],
  plugins: [clipsOut],
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

// the clip sets left out of the bundle above, as JSON beside the page (fetched only with ?hero=new)
fs.mkdirSync('dist/assets/hero2', { recursive: true });
let clipBytes = 0;
for (const p of clipSets) {
  const mod = await import(url.pathToFileURL(p).href);
  const json = JSON.stringify(mod.default);
  fs.writeFileSync(path.join('dist/assets/hero2', path.basename(p, '.js') + '.json'), json);
  clipBytes += json.length;
}
console.log(`Wrote dist/assets/hero2 (${clipSets.length} clip sets, ${(clipBytes / 1048576).toFixed(1)} MB)`);
