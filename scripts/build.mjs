// Smallest practical build step for this project.
//
// The game itself (index.html, style.css, game.js) is still plain, unbundled
// source -- it needs no build step and none is added here. The only thing
// that actually requires bundling is src/playgames-bridge.js, since the
// @idleflowgames/capacitor-play-games plugin is an ES module package (bare
// "import" specifiers that a browser can't resolve on its own).
//
// This script:
//   1. Bundles src/playgames-bridge.js -> playgames-bridge.js at the repo
//      root, so the GitHub Pages / plain-browser deployment (which serves
//      straight from the repo root, no build step of its own) has a real,
//      self-contained file to load -- not a 404.
//   2. Copies index.html, style.css, game.js, and the freshly-bundled
//      playgames-bridge.js into www/, which is Capacitor's webDir
//      (see capacitor.config.json). This replaces the old manual copy of
//      those three files into www/ with the same result, automated.
//
// Run with: npm run build

import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const wwwDir = path.join(root, 'www');

async function main() {
  await build({
    entryPoints: [path.join(root, 'src/playgames-bridge.js')],
    outfile: path.join(root, 'playgames-bridge.js'),
    bundle: true,
    format: 'esm',
    target: 'es2019',
    minify: false,
    sourcemap: false,
    logLevel: 'info'
  });

  mkdirSync(wwwDir, { recursive: true });
  for (const file of ['index.html', 'style.css', 'game.js', 'playgames-bridge.js']) {
    copyFileSync(path.join(root, file), path.join(wwwDir, file));
  }
  console.log('Copied index.html, style.css, game.js, playgames-bridge.js -> www/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
