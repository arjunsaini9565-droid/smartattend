'use strict';
// Bundles the React client into server/public using esbuild.
const path = require('node:path');
const fs = require('node:fs');
let esbuild;
try { esbuild = require('esbuild'); } catch { esbuild = require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); }

const root = path.join(__dirname, '..');
const out = path.join(root, 'server', 'public');
const watch = process.argv.includes('--watch');
fs.mkdirSync(out, { recursive: true });

const common = {
  absWorkingDir: root, bundle: true, minify: !watch, sourcemap: watch, target: ['es2020'], logLevel: 'info',
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' }, jsx: 'automatic', loader: { '.js': 'jsx' },
  nodePaths: [path.join(root, 'node_modules'), '/opt/npm-tools/node_modules'],
};

async function main() {
  fs.copyFileSync(path.join(root, 'client', 'index.html'), path.join(out, 'index.html'));
  const js = { ...common, entryPoints: ['client/src/main.jsx'], outfile: 'server/public/app.js' };
  const css = { ...common, entryPoints: ['client/src/styles.css'], outfile: 'server/public/app.css', sourcemap: false };
  if (watch) { for (const o of [js, css]) await (await esbuild.context(o)).watch(); console.log('Watching for changes...'); }
  else { await esbuild.build(js); await esbuild.build(css); console.log('Client built to server/public'); }
}
main().catch((e) => { console.error(e); process.exit(1); });
