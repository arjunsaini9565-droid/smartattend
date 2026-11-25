'use strict';
const { get, post, put, HttpError, validate } = require('../lib/http');
const { q, tx } = require('../lib/db');
const sec = require('../lib/security');
const { notifyRole } = require('../lib/notify');

// ---- simple in-memory brute-force protection ----
const attempts = new Map();
function throttle(key) {
  const now = Date.now(); const rec = attempts.get(key) || { n: 0, first: now };
  if (now - rec.first > 10 * 60000) { rec.n = 0; rec.first = now; }
  if (rec.n >= 8) throw new HttpError(429, 'Too many failed sign-in attempts. Please wait a few minutes and try again.');
  return rec;
}

function profile(userId) {
  const u = q.get('SELECT id,name,email,role,active,created_at,last_login FROM users WHERE id=?', userId);
  if (!u) return null;
  if (u.role === 'student') {
    u.student = q.get(`SELECT st.id, st.roll_no, st.course_id, co.name AS course_name, co.code AS course_code, st.semester, st.section, st.phone,
      (st.face_samples > 0) AS face_enrolled FROM students st JOIN courses co ON co.id=st.course_id WHERE st.user_id=?`, userId);
    if (u.student) u.student.face_enrolled = !!u.student.face_enrolled;
  }
  if (u.role === 'teacher') u.teacher = q.get(`SELECT t.id, t.employee_id, t.department_id, d.name AS department_name, t.phone
    FROM teachers t LEFT JOIN departments d ON d.id=t.department_id WHERE t.user_id=?`, userId);
  return u;
}

post('/api/auth/login', null, ({ body, ip }) => {
  const v = validate(body, { email: { type: 'email', required: true, label: 'Email' }, password: { type: 'string', required: true, label: 'Password', max: 128 } });
  const key = `${ip}|${v.email}`; const rec = throttle(key);
  const user = q.get('SELECT * FROM users WHERE email=?', v.email);
  if (!user || !sec.verifyPassword(v.password, user.password_hash)) {
    rec.n++; attempts.set(key, rec);
    throw new HttpError(401, 'Incorrect email or password');
  }
  if (!user.active) throw new HttpError(403, user.role === 'teacher' ? 'Your teacher account is awaiting administrator approval' : 'This account has been disabled');
  attempts.delete(key);
  q.run("UPDATE users SET last_login=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?", user.id);
  return { token: sec.signToken({ sub: user.id, role: user.role }), user: profile(user.id) };
});

post('/api/auth/register', null, ({ body }) => {
  const base = validate(body, {
    role: { type: 'enum', values: ['student', 'teacher'], required: true, label: 'Role' },
    name: { required: true, min: 2, max: 80, label: 'Full name', pattern: /^[\p{L} .'-]+$/u, message: 'Full name may only contain letters, spaces and . \' -' },
    email: { type: 'email', required: true, label: 'Email' },
  });
  const pwErr = sec.passwordProblem(body.password);
  if (pwErr) throw new HttpError(422, 'Please correct the highlighted fields', { password: pwErr });
  if (q.get('SELECT 1 FROM users WHERE email=?', base.email)) throw new HttpError(409, 'An account with this email already exists', { email: 'Email already registered' });
  return tx(() => {
    if (base.role === 'student') {
      const s = validate(body, {
        roll_no: { required: true, max: 20, label: 'Roll number', pattern: /^[A-Za-z0-9/-]+$/, message: 'Roll number may only contain letters, digits, - and /' },
        course_id: { type: 'int', required: true, label: 'Course' }, semester: { type: 'int', required: true, min: 1, max: 12, label: 'Semester' }, section: { max: 5 },
      });
      if (!q.get('SELECT 1 FROM courses WHERE id=?', s.course_id)) throw new HttpError(422, 'Please correct the highlighted fields', { course_id: 'Select a valid course' });
      if (q.get('SELECT 1 FROM students WHERE roll_no=?', s.roll_no)) throw new HttpError(409, 'Roll number already registered', { roll_no: 'Roll number already registered' });
      const uid = Number(q.run('INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,?,1)', base.name, base.email, sec.hashPassword(body.password), 'student').lastInsertRowid);
      q.run('INSERT INTO students(user_id,roll_no,course_id,semester,section) VALUES(?,?,?,?,?)', uid, s.roll_no, s.course_id, s.semester, s.section || 'A');
      notifyRole('admin', 'info', 'New student registered', `${base.name} (${s.roll_no}) registered. Enroll a face photo so they can be recognized.`);
      return { message: 'Registration successful. You can sign in now.' };
    }
    const t = validate(body, { employee_id: { required: true, max: 20, label: 'Employee ID', pattern: /^[A-Za-z0-9/-]+$/ }, department_id: { type: 'int', required: true, label: 'Department' } });
    if (q.get('SELECT 1 FROM teachers WHERE employee_id=?', t.employee_id)) throw new HttpError(409, 'Employee ID already registered', { employee_id: 'Employee ID already registered' });
    const uid = Number(q.run('INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,?,0)', base.name, base.email, sec.hashPassword(body.password), 'teacher').lastInsertRowid);
    q.run('INSERT INTO teachers(user_id,employee_id,department_id) VALUES(?,?,?)', uid, t.employee_id, t.department_id);
    notifyRole('admin', 'warning', 'Teacher approval pending', `${base.name} registered as a teacher and is waiting for approval.`);
    return { message: 'Registration received. An administrator must approve your account before you can sign in.' };
  });
});

get('/api/auth/me', ['*'], ({ user }) => ({ user: profile(user.id) }));

put('/api/auth/profile', ['*'], ({ user, body }) => {
  const v = validate(body, { name: { required: true, min: 2, max: 80, label: 'Full name' }, phone: { max: 20, pattern: /^[0-9+() -]*$/, message: 'Phone may only contain digits, spaces, + ( ) -' } });
  tx(() => {
    q.run('UPDATE users SET name=? WHERE id=?', v.name, user.id);
    if (user.role === 'student') q.run('UPDATE students SET phone=? WHERE user_id=?', v.phone, user.id);
    if (user.role === 'teacher') q.run('UPDATE teachers SET phone=? WHERE user_id=?', v.phone, user.id);
  });
  return { user: profile(user.id) };
});

post('/api/auth/change-password', ['*'], ({ user, body }) => {
  if (!body.current) throw new HttpError(422, 'Please correct the highlighted fields', { current: 'Current password is required' });
  const row = q.get('SELECT password_hash FROM users WHERE id=?', user.id);
  if (!sec.verifyPassword(String(body.current), row.password_hash)) throw new HttpError(422, 'Please correct the highlighted fields', { current: 'Current password is incorrect' });
  const err = sec.passwordProblem(body.next);
  if (err) throw new HttpError(422, 'Please correct the highlighted fields', { next: err });
  if (body.next === body.current) throw new HttpError(422, 'Please correct the highlighted fields', { next: 'New password must differ from the current one' });
  q.run('UPDATE users SET password_hash=? WHERE id=?', sec.hashPassword(body.next), user.id);
  return { message: 'Password updated successfully' };
});

module.exports = { profile };
