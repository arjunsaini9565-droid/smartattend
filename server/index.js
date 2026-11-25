'use strict';
// SmartAttend AI server: static React app + JSON API. No third-party dependencies.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { routes, get, readBody, serveStatic, HttpError } = require('./lib/http');
const sec = require('./lib/security');
const { q } = require('./lib/db');
const { seedIfEmpty } = require('./lib/seed');
const face = require('./lib/face');

require('./routes/auth'); require('./routes/academics'); require('./routes/people'); require('./routes/attendance'); require('./routes/reports');

const PUBLIC_DIR = path.join(__dirname, 'public');
const VENDOR_FACE = path.join(PUBLIC_DIR, 'vendor', 'face-api');
const CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15';

// Frontend asks where to load face-api.js and its models from: a local copy if you ran
// `npm run vendor:face` (works offline / on a campus LAN), otherwise the CDN.
get('/api/config', null, () => {
  const local = fs.existsSync(path.join(VENDOR_FACE, 'face-api.js')) && fs.existsSync(path.join(VENDOR_FACE, 'model', 'tiny_face_detector_model.bin'));
  return {
    faceLibUrl: local ? '/vendor/face-api/face-api.js' : `${CDN}/dist/face-api.js`,
    faceModelsUrl: local ? '/vendor/face-api/model' : `${CDN}/model`,
    faceSource: local ? 'local' : 'cdn', livenessRequired: face.REQUIRE_LIVENESS, matchThreshold: face.THRESHOLD,
  };
});
get('/api/health', null, () => ({ ok: true, time: new Date().toISOString() }));

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const headers = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(self), microphone=()' };
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (!serveStatic(PUBLIC_DIR, url.pathname, res)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
    return;
  }
  const send = (status, body, extra = {}) => {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(json);
  };
  try {
    let matched = null; let pathMatched = false;
    for (const r of routes) {
      const m = r.regex.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== req.method) continue;
      matched = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; break;
    }
    if (!matched) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Endpoint not found');

    let user = null;
    if (matched.r.roles) {
      const auth = req.headers.authorization || '';
      const payload = sec.verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');
      if (!payload) throw new HttpError(401, 'Your session has expired. Please sign in again.');
      user = q.get('SELECT id,name,email,role,active FROM users WHERE id=?', payload.sub);
      if (!user || !user.active) throw new HttpError(401, 'Account unavailable. Please sign in again.');
      if (!matched.r.roles.includes('*') && !matched.r.roles.includes(user.role)) throw new HttpError(403, 'You do not have permission to do that');
    }
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const ip = req.socket.remoteAddress || '';
    const out = await matched.r.handler({ req, res, params: matched.params, query: Object.fromEntries(url.searchParams), body, user, ip });
    if (out && out.__raw) {
      res.writeHead(200, { 'Content-Type': out.type, 'Content-Disposition': `attachment; filename="${out.filename}"`, 'Content-Length': out.body.length, 'Cache-Control': 'no-store' });
      return res.end(out.body);
    }
    send(200, out ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError) return send(err.status, { error: err.message, fields: err.fields });
    const msg = String(err && err.message || '');
    if (/UNIQUE constraint/i.test(msg)) return send(409, { error: 'That value already exists. Codes, emails and roll numbers must be unique.' });
    if (/FOREIGN KEY constraint/i.test(msg)) return send(409, { error: 'This item is linked to other records. Remove or reassign those first.' });
    console.error('[error]', req.method, url.pathname, err);
    send(500, { error: 'Something went wrong on the server. Please try again.' });
  }
}

const PORT = Number(process.env.PORT || 3000);
const server = process.env.SSL_KEY && process.env.SSL_CERT
  ? https.createServer({ key: fs.readFileSync(process.env.SSL_KEY), cert: fs.readFileSync(process.env.SSL_CERT) }, handle)
  : http.createServer(handle);

if (require.main === module) {
  if (seedIfEmpty()) console.log('Seeded sample data.');
  server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
    const scheme = process.env.SSL_KEY ? 'https' : 'http';
    console.log(`SmartAttend AI running at ${scheme}://localhost:${PORT}`);
    console.log('Demo logins -> admin@smartattend.edu / Admin@123 | ananya.sharma@smartattend.edu / Teacher@123 | aarav.mehta@student.smartattend.edu / Student@123');
    if (!process.env.SSL_KEY) console.log('Note: browsers only allow camera access on https:// or http://localhost.');
  });
}
module.exports = { server, handle };
