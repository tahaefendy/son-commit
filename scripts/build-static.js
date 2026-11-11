'use strict';
/*
 * GitHub Pages için statik sürüm üretir (docs/ klasörü).
 * Sunucu gerekmez: oyun motoru yönetici sayfasının içinde çalışır, telefonlar WebRTC (PeerJS) ile bağlanır.
 *   npm run build:static
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const S = path.join(OUT, 'static-tmp');

const aliasPlugin = {
  name: 'alias',
  setup(b) {
    b.onResolve({ filter: /^crypto$/ }, () => ({ path: path.join(ROOT, 'static-src/shims/crypto.js') }));
    b.onResolve({ filter: /^\.\/voice$/ }, (a) => (a.importer.includes(`${path.sep}server${path.sep}`) ? { path: path.join(ROOT, 'static-src/shims/voice.js') } : undefined));
  },
};

function copyDir(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name); const d = path.join(dst, e.name);
    if (skip(s)) continue;
    if (e.isDirectory()) copyDir(s, d, skip); else fs.copyFileSync(s, d);
  }
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 's'), { recursive: true });

  copyDir(path.join(ROOT, 'public'), path.join(OUT, 's'), (p) => {
    const rel = path.relative(path.join(ROOT, 'public'), p);
    return rel.endsWith('.html') || rel.startsWith(path.join('audio', 'samples'));
  });

  const common = { bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, plugins: [aliasPlugin], define: { global: 'globalThis' }, logLevel: 'info' };
  await esbuild.build({ ...common, entryPoints: [path.join(ROOT, 'static-src/host-entry.js')], outfile: path.join(OUT, 's/static/host-engine.js') });
  await esbuild.build({ ...common, entryPoints: [path.join(ROOT, 'static-src/player-entry.js')], outfile: path.join(OUT, 's/static/player-net.js') });

  const page = (src, dst, bundle) => {
    let h = fs.readFileSync(path.join(ROOT, 'public', src), 'utf8');
    h = h.replace('<script src="/socket.io/socket.io.js"></script>', `<script src="s/static/${bundle}"></script>`).replace(/\/s\//g, 's/');
    fs.writeFileSync(path.join(OUT, dst), h);
  };
  page('host/index.html', 'index.html', 'host-engine.js');
  page('player/join.html', 'join.html', 'player-net.js');
  page('player/play.html', 'play.html', 'player-net.js');
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  console.log('\nStatik sürüm hazır: docs/');
})().catch((e) => { console.error(e); process.exit(1); });
