'use strict';
// Minimal router, body parsing, validation helpers and static file serving.
const fs = require('node:fs');
const path = require('node:path');

class HttpError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}

const routes = [];
function route(method, pattern, roles, handler) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, regex, keys, roles, handler });
}
const get = (p, r, h) => route('GET', p, r, h);
const post = (p, r, h) => route('POST', p, r, h);
const put = (p, r, h) => route('PUT', p, r, h);
const del = (p, r, h) => route('DELETE', p, r, h);

async function readBody(req, limit = 3 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'Request body too large');
    chunks.push(c);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Request body is not valid JSON'); }
}

// ---------- validation ----------
// rules: { field: { type:'string'|'int'|'number'|'email'|'date'|'enum', required, min, max, values, label } }
function validate(body, rules) {
  const out = {}; const errors = {};
  for (const [key, r] of Object.entries(rules)) {
    let v = body ? body[key] : undefined;
    const label = r.label || key;
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      if (r.required) errors[key] = `${label} is required`;
      else if (r.default !== undefined) out[key] = r.default;
      else out[key] = null;
      continue;
    }
    switch (r.type || 'string') {
      case 'string':
        v = String(v).trim();
        if (r.min && v.length < r.min) errors[key] = `${label} must be at least ${r.min} characters`;
        else if (v.length > (r.max || 200)) errors[key] = `${label} must be at most ${r.max || 200} characters`;
        else if (r.pattern && !r.pattern.test(v)) errors[key] = r.message || `${label} has an invalid format`;
        break;
      case 'email':
        v = String(v).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 120) errors[key] = `${label} must be a valid email address`;
        break;
      case 'int':
        v = Number(v);
        if (!Number.isInteger(v)) errors[key] = `${label} must be a whole number`;
        else if (r.min !== undefined && v < r.min) errors[key] = `${label} must be at least ${r.min}`;
        else if (r.max !== undefined && v > r.max) errors[key] = `${label} must be at most ${r.max}`;
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || isNaN(Date.parse(v))) errors[key] = `${label} must be a date (YYYY-MM-DD)`;
        else v = String(v);
        break;
      case 'enum':
        if (!r.values.includes(v)) errors[key] = `${label} must be one of: ${r.values.join(', ')}`;
        break;
      case 'bool': v = v === true || v === 'true' || v === 1; break;
    }
    out[key] = v;
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields', errors);
  return out;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.bin': 'application/octet-stream', '.map': 'application/json' };

function serveStatic(root, urlPath, res) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) return false;
  let target = file;
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    if (path.extname(rel)) return false;       // missing asset -> 404
    target = path.join(root, 'index.html');    // SPA fallback
  }
  if (!fs.existsSync(target)) return false;
  const ext = path.extname(target);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(target).pipe(res);
  return true;
}

module.exports = { HttpError, routes, route, get, post, put, del, readBody, validate, serveStatic };
