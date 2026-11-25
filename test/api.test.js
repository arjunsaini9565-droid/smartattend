'use strict';
// End-to-end API tests. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smartattend-test-'));
const { server } = require('../server/index.js');
const { seedIfEmpty } = require('../server/lib/seed.js');

let base;
test.before(async () => {
  seedIfEmpty();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function api(method, url, { token, body, raw } = {}) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return res;
  return { status: res.status, data: await res.json() };
}
const login = async (email, password) => (await api('POST', '/api/auth/login', { body: { email, password } })).data.token;

// deterministic pseudo-random face descriptors
function rng(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296 - 0.5; }; }
const person = (seed) => { const r = rng(seed); return Array.from({ length: 128 }, () => r() * 0.35); };
const noisy = (d, seed, n = 0.02) => { const r = rng(seed); return d.map((x) => x + r() * n); };
const blink = { blinks: 2, minEar: 0.14, maxEar: 0.31 };

let admin, teacher, student;
test('authentication and validation', async () => {
  admin = await login('admin@smartattend.edu', 'Admin@123');
  teacher = await login('ananya.sharma@smartattend.edu', 'Teacher@123');
  student = await login('aarav.mehta@student.smartattend.edu', 'Student@123');
  assert.ok(admin && teacher && student);
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'admin@smartattend.edu', password: 'wrong' } })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'not-an-email', password: 'x' } })).status, 422);
  assert.equal((await api('POST', '/api/auth/login', { body: { email: 'neha.kapoor@smartattend.edu', password: 'Teacher@123' } })).status, 403, 'pending teacher cannot sign in');
  const weak = await api('POST', '/api/auth/register', { body: { role: 'student', name: 'Test User', email: 'tu@x.edu', password: 'short', roll_no: 'T1', course_id: 1, semester: 3 } });
  assert.equal(weak.status, 422); assert.ok(weak.data.fields.password);
  const ok = await api('POST', '/api/auth/register', { body: { role: 'student', name: 'Test User', email: 'tu@x.edu', password: 'Passw0rdOK', roll_no: 'T1', course_id: 1, semester: 3 } });
  assert.equal(ok.status, 200);
  assert.equal((await api('POST', '/api/auth/register', { body: { role: 'student', name: 'Dup', email: 'tu@x.edu', password: 'Passw0rdOK', roll_no: 'T2', course_id: 1, semester: 3 } })).status, 409);
});

test('role based access control', async () => {
  assert.equal((await api('GET', '/api/admin/stats')).status, 401);
  assert.equal((await api('GET', '/api/admin/stats', { token: teacher })).status, 403);
  assert.equal((await api('GET', '/api/admin/stats', { token: student })).status, 403);
  assert.equal((await api('GET', '/api/students', { token: student })).status, 403);
  assert.equal((await api('POST', '/api/departments', { token: teacher, body: { name: 'X', code: 'X' } })).status, 403);
  const stats = await api('GET', '/api/admin/stats', { token: admin });
  assert.equal(stats.status, 200); assert.ok(stats.data.counts.students >= 25); assert.ok(stats.data.counts.records > 100);
});

test('password change', async () => {
  const bad = await api('POST', '/api/auth/change-password', { token: student, body: { current: 'nope', next: 'NewPass123' } });
  assert.equal(bad.status, 422);
  const t = await login('tu@x.edu', 'Passw0rdOK');
  assert.equal((await api('POST', '/api/auth/change-password', { token: t, body: { current: 'Passw0rdOK', next: 'Better1234' } })).status, 200);
  assert.ok(await login('tu@x.edu', 'Better1234'));
});

let classId, sessionId, roster;
test('face enrollment, recognition, duplicates, late and anti-spoofing', async () => {
  const classes = (await api('GET', '/api/classes', { token: teacher })).data.items;
  const cls = classes.find((c) => c.subject_code === 'CS301'); classId = cls.id;
  assert.equal((await api('GET', '/api/classes', { token: teacher })).data.items.length, 2, 'teacher sees only own classes');
  const students = (await api('GET', '/api/students?course_id=1&semester=3&limit=100', { token: teacher })).data.items;
  roster = students.filter((s) => s.course_code === 'BTCSE');
  assert.ok(roster.length >= 12);

  // enroll two students via API (descriptors are what face-api.js would produce)
  const a = roster[0]; const b = roster[1];
  assert.equal((await api('POST', `/api/students/${a.id}/face`, { token: teacher, body: { descriptors: [person(1), noisy(person(1), 9)], photo: 'data:image/jpeg;base64,/9j/4AAQ' } })).status, 200);
  assert.equal((await api('POST', `/api/students/${b.id}/face`, { token: admin, body: { descriptors: [person(2)] } })).status, 200);
  const clash = await api('POST', `/api/students/${roster[2].id}/face`, { token: admin, body: { descriptors: [noisy(person(1), 4)] } });
  assert.equal(clash.status, 409, 'same face cannot be enrolled for two students');
  assert.equal((await api('POST', `/api/students/${roster[2].id}/face`, { token: admin, body: { descriptors: [[1, 2, 3]] } })).status, 422);

  const start = await api('POST', `/api/classes/${classId}/sessions/start`, { token: teacher, body: {} });
  assert.equal(start.status, 200); sessionId = start.data.session.id;
  assert.equal(start.data.summary.pending, start.data.students.length);
  assert.equal((await api('POST', `/api/classes/${classId}/sessions/start`, { token: teacher, body: {} })).data.resumed, true, 'one active session per class');

  const rec = (d, liveness = blink) => api('POST', `/api/sessions/${sessionId}/recognize`, { token: teacher, body: { descriptor: d, liveness } });
  const r1 = await rec(noisy(person(1), 5));
  assert.equal(r1.data.result, 'marked'); assert.equal(r1.data.student.id, a.id); assert.equal(r1.data.status, 'present');
  const r2 = await rec(noisy(person(1), 6));
  assert.equal(r2.data.result, 'duplicate', 'no duplicate attendance entries');
  assert.equal((await rec(person(99))).data.result, 'unknown', 'unknown faces are rejected');
  assert.equal((await rec(noisy(person(2), 7), { blinks: 0, minEar: 0.3, maxEar: 0.31 })).data.result, 'spoof', 'no blink = spoof');
  assert.equal((await rec(noisy(person(2), 7), null)).data.result, 'spoof');
  assert.equal((await rec(noisy(person(2), 7))).data.result, 'marked');
  assert.equal((await api('POST', `/api/sessions/${sessionId}/recognize`, { token: teacher, body: { descriptor: [1, 2], liveness: blink } })).status, 422);
  assert.equal((await api('POST', `/api/sessions/${sessionId}/recognize`, { token: student, body: { descriptor: person(1), liveness: blink } })).status, 403);
  const other = (await api('GET', '/api/classes', { token: admin })).data.items.find((c) => c.teacher_name !== 'Dr. Ananya Sharma');
  assert.equal((await api('GET', `/api/sessions/${sessionId}`, { token: await login('meera.nair@smartattend.edu', 'Teacher@123') })).status, 403, "other teacher can't touch this session");
  assert.ok(other);
});

test('manual marking, corrections and audit trail', async () => {
  const c = roster[3];
  const m = await api('PUT', `/api/sessions/${sessionId}/attendance/${c.id}`, { token: teacher, body: { status: 'late' } });
  assert.equal(m.status, 200);
  const noReason = await api('PUT', `/api/sessions/${sessionId}/attendance/${c.id}`, { token: teacher, body: { status: 'present' } });
  assert.equal(noReason.status, 422, 'corrections need a reason');
  assert.equal((await api('PUT', `/api/sessions/${sessionId}/attendance/${c.id}`, { token: teacher, body: { status: 'present', reason: 'Arrived on time, camera missed them' } })).status, 200);
  assert.equal((await api('PUT', `/api/sessions/${sessionId}/attendance/${c.id}`, { token: teacher, body: { status: 'nope' } })).status, 422);
  const audit = (await api('GET', `/api/audit?session_id=${sessionId}`, { token: teacher })).data.items;
  assert.equal(audit.length, 2); assert.equal(audit[0].old_status, 'late'); assert.equal(audit[0].new_status, 'present');
});

test('closing a session marks absentees; student view and alerts', async () => {
  const stop = await api('POST', `/api/sessions/${sessionId}/stop`, { token: teacher });
  assert.equal(stop.status, 200); assert.equal(stop.data.summary.pending, 0); assert.ok(stop.data.summary.absent >= 9);
  assert.equal((await api('POST', `/api/sessions/${sessionId}/stop`, { token: teacher })).status, 409);
  assert.equal((await api('POST', `/api/sessions/${sessionId}/recognize`, { token: teacher, body: { descriptor: person(1), liveness: blink } })).status, 409);
  // late correction after close should be allowed with a reason
  assert.equal((await api('PUT', `/api/sessions/${sessionId}/attendance/${roster[5].id}`, { token: teacher, body: { status: 'present', reason: 'Medical certificate' } })).status, 200);

  const me = await api('GET', '/api/me/attendance', { token: student });
  assert.equal(me.status, 200); assert.ok(me.data.subjects.length === 4); assert.ok(me.data.history.length > 0);
  const lowStudent = (await api('GET', '/api/reports/attendance?view=summary&below=1&format=json', { token: admin })).data.rows[0];
  assert.ok(lowStudent && lowStudent.pct < 75);
  const low = await api('GET', `/api/students/${lowStudent.student_id}/attendance`, { token: admin });
  assert.ok(low.data.alerts.length > 0); assert.ok(low.data.alerts[0].needed > 0);
  assert.equal((await api('GET', `/api/students/${lowStudent.student_id}/attendance`, { token: student })).status, 403);
});

test('analytics, reports and exports', async () => {
  const an = await api('GET', '/api/analytics', { token: admin });
  assert.equal(an.status, 200); assert.ok(an.data.daily.length > 5 && an.data.weekly.length > 3 && an.data.monthly.length >= 2); assert.ok(an.data.low.length > 0);
  const tAn = await api('GET', '/api/analytics', { token: teacher });
  assert.ok(tAn.data.byClass.length === 2);
  assert.equal((await api('GET', `/api/analytics?class_id=${classId + 4}`, { token: teacher })).status, 403);
  assert.equal((await api('GET', '/api/analytics?from=2026-02-01&to=2026-01-01', { token: admin })).status, 422);

  const csv = await api('GET', '/api/reports/attendance?format=csv&view=summary', { token: admin, raw: true });
  assert.match(await csv.text(), /Roll No,Student/);
  const xl = Buffer.from(await (await api('GET', '/api/reports/attendance?format=xlsx&view=detail&from=2026-10-01', { token: admin, raw: true })).arrayBuffer());
  assert.equal(xl.readUInt32LE(0), 0x04034b50, 'xlsx is a zip');
  const pdf = Buffer.from(await (await api('GET', '/api/reports/attendance?format=pdf&view=summary', { token: teacher, raw: true })).arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.toString('latin1').includes('%%EOF'));
  const search = await api('GET', '/api/reports/attendance?view=summary&q=Aarav', { token: admin });
  assert.equal(search.data.rows.length, 1);
  fs.writeFileSync(path.join(process.env.DATA_DIR, 'sample.xlsx'), xl); fs.writeFileSync(path.join(process.env.DATA_DIR, 'sample.pdf'), pdf);
});

test('notifications and CRUD', async () => {
  const n = await api('GET', '/api/notifications', { token: student });
  assert.equal(n.status, 200);
  assert.equal((await api('POST', '/api/notifications/broadcast', { token: admin, body: { audience: 'students', title: 'Exam notice', message: 'Mid-terms begin Monday' } })).data.sent >= 25, true);
  const n2 = await api('GET', '/api/notifications', { token: student });
  assert.ok(n2.data.unread >= 1);
  await api('POST', '/api/notifications/read', { token: student, body: {} });
  assert.equal((await api('GET', '/api/notifications', { token: student })).data.unread, 0);

  const d = await api('POST', '/api/departments', { token: admin, body: { name: 'Physics', code: 'phy' } });
  assert.equal(d.status, 200);
  assert.equal((await api('POST', '/api/departments', { token: admin, body: { name: 'Physics 2', code: 'PHY' } })).status, 409);
  assert.equal((await api('DELETE', `/api/departments/${1}`, { token: admin })).status, 409, 'cannot delete a department that has courses');
  assert.equal((await api('DELETE', `/api/departments/${d.data.id}`, { token: admin })).status, 200);
  const s = await api('POST', '/api/students', { token: admin, body: { name: 'New Student', email: 'new@x.edu', roll_no: 'N-1', course_id: 1, semester: 3 } });
  assert.equal(s.status, 200);
  assert.equal((await api('PUT', `/api/teachers/${(await api('GET', '/api/teachers', { token: admin })).data.items.find((t) => !t.active).id}/approval`, { token: admin, body: { active: true } })).status, 200);
  assert.ok(await login('neha.kapoor@smartattend.edu', 'Teacher@123'), 'approved teacher can now sign in');
  assert.equal((await api('DELETE', `/api/students/${s.data.id}`, { token: admin })).status, 200);
});
