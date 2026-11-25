'use strict';
// Server-side face matching. The browser (face-api.js) turns a face into a
// 128-number descriptor; the server compares it against the encrypted gallery
// of students enrolled in the class, so matching rules can't be bypassed
// from the client.
const { decryptJSON } = require('./security');

const THRESHOLD = Number(process.env.FACE_THRESHOLD || 0.5);   // max euclidean distance for a match
const AMBIGUITY_MARGIN = 0.03;                                  // 2nd-best must be this much worse
const REQUIRE_LIVENESS = process.env.REQUIRE_LIVENESS !== 'false';

const cache = new Map(); // studentId -> { stamp, descriptors }

function gallery(students) {
  const out = [];
  for (const s of students) {
    if (!s.face_data) continue;
    let entry = cache.get(s.id);
    if (!entry || entry.stamp !== s.face_updated_at) {
      entry = { stamp: s.face_updated_at, descriptors: decryptJSON(s.face_data) || [] };
      cache.set(s.id, entry);
    }
    out.push({ id: s.id, descriptors: entry.descriptors });
  }
  return out;
}
function forget(studentId) { cache.delete(studentId); }

function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < 128; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

function validDescriptor(d) {
  return Array.isArray(d) && d.length === 128 && d.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 10);
}

// Returns { status: 'match'|'unknown'|'ambiguous'|'empty', studentId, distance }
function match(descriptor, people) {
  if (!people.length) return { status: 'empty' };
  let best = { id: null, dist: Infinity }; let second = Infinity;
  for (const p of people) {
    let d = Infinity;
    for (const ref of p.descriptors) d = Math.min(d, distance(descriptor, ref));
    if (d < best.dist) { second = best.dist; best = { id: p.id, dist: d }; }
    else if (d < second) second = d;
  }
  if (best.dist > THRESHOLD) return { status: 'unknown', distance: best.dist };
  if (second - best.dist < AMBIGUITY_MARGIN && second <= THRESHOLD) return { status: 'ambiguous', distance: best.dist };
  return { status: 'match', studentId: best.id, distance: best.dist };
}

// Basic anti-spoofing sanity check on the blink evidence gathered in the browser.
function livenessProblem(l) {
  if (!REQUIRE_LIVENESS) return null;
  if (!l || typeof l !== 'object') return 'Liveness check missing';
  const { blinks, minEar, maxEar } = l;
  if (![blinks, minEar, maxEar].every((x) => typeof x === 'number' && Number.isFinite(x))) return 'Liveness check malformed';
  if (blinks < 1 || blinks > 30) return 'No blink detected';
  if (minEar <= 0 || maxEar > 0.7 || maxEar - minEar < 0.05) return 'Eye movement looks artificial';
  return null;
}

module.exports = { THRESHOLD, REQUIRE_LIVENESS, gallery, forget, match, validDescriptor, livenessProblem };
