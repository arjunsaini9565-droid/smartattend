'use strict';
// Password hashing (scrypt), signed tokens (HMAC-SHA256 JWT) and AES-256-GCM
// encryption for facial data at rest. Uses only Node's built-in crypto.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Secrets are read from the environment or generated once and kept in data/.
function loadSecret(envName, fileName) {
  if (process.env[envName]) return Buffer.from(process.env[envName], 'hex');
  const file = path.join(DATA_DIR, fileName);
  if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key.toString('hex'), { mode: 0o600 });
  return key;
}
const JWT_SECRET = loadSecret('JWT_SECRET', 'jwt.key');
const FACE_KEY = loadSecret('FACE_KEY', 'face.key');

// ---------- passwords ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 128) return 'Password is too long';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers';
  return null;
}

// ---------- tokens ----------
const b64 = (b) => Buffer.from(b).toString('base64url');
function signToken(payload, ttlSeconds = 8 * 3600) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

// ---------- encryption of biometric data ----------
function encryptJSON(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', FACE_KEY, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}
function decryptJSON(blob) {
  if (!blob) return null;
  const [, iv, tag, enc] = blob.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', FACE_KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]);
  return JSON.parse(out.toString('utf8'));
}

module.exports = { DATA_DIR, hashPassword, verifyPassword, passwordProblem, signToken, verifyToken, encryptJSON, decryptJSON };
