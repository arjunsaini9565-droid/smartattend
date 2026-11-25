'use strict';
// Optional: download face-api.js and its models once so the app works fully offline / on a campus LAN.
// Usage: npm run vendor:face
const fs = require('node:fs');
const path = require('node:path');

const VERSION = '1.7.15';
const BASE = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VERSION}`;
const dest = path.join(__dirname, '..', 'server', 'public', 'vendor', 'face-api');
const models = ['tiny_face_detector_model-weights_manifest.json', 'tiny_face_detector_model.bin', 'face_landmark_68_model-weights_manifest.json', 'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json', 'face_recognition_model.bin'];

async function get(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log('  saved', path.relative(dest, file));
}
(async () => {
  console.log(`Downloading face-api.js ${VERSION} to ${dest}`);
  await get(`${BASE}/dist/face-api.js`, path.join(dest, 'face-api.js'));
  for (const m of models) await get(`${BASE}/model/${m}`, path.join(dest, 'model', m));
  console.log('Done. The server will now serve face recognition files locally.');
})().catch((e) => { console.error('Failed:', e.message, '\nCheck your internet connection and try again.'); process.exit(1); });
